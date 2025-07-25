// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { skip = 0, limit = 5 } = event;

  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }

  try {
    // 1. 查找用户点赞的所有记录，按时间倒序
    const votesRes = await db.collection('votes_log')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .get();
    if (!votesRes.data || votesRes.data.length === 0) {
      return { success: true, posts: [], message: '暂无点赞记录' };
    }
    // 2. 获取所有点赞的帖子ID，分页
    const allPostIds = votesRes.data.map(v => v.postId);
    const pagedPostIds = allPostIds.slice(skip, skip + limit);
    if (pagedPostIds.length === 0) {
      return { success: true, posts: [], message: '暂无更多点赞记录' };
    }
    // 3. 用聚合查询posts，补齐作者、评论数、isVoted等
    const postsRes = await db.collection('posts').aggregate()
      .match({ _id: _.in(pagedPostIds) })
      .lookup({
        from: 'users',
        localField: '_openid',
        foreignField: '_openid',
        as: 'authorInfo',
      })
      .lookup({
        from: 'comments',
        localField: '_id',
        foreignField: 'postId',
        as: 'comments',
      })
      .lookup({
        from: 'votes_log',
        let: { post_id: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [ { $eq: ['$postId', '$$post_id'] }, { $eq: ['$_openid', openid] } ] } } }
        ],
        as: 'userVote',
      })
      .project({
        _id: 1, _openid: 1, title: 1, content: 1, createTime: 1, imageUrl: 1, imageUrls: 1, originalImageUrl: 1, originalImageUrls: 1, votes: 1,
        authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
        authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), '']),
        commentCount: $.size('$comments'),
        isVoted: $.gt([$.size('$userVote'), 0]),
      })
      .end();
    let posts = postsRes.list;
    // 保证 imageUrls、originalImageUrls 一定为数组
    posts.forEach(post => {
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
    });
    // 4. 转换图片fileID为临时URL（与getPostList一致）
    const fileIDs = [];
    posts.forEach(post => {
      if (post.imageUrls && Array.isArray(post.imageUrls)) {
        post.imageUrls.forEach(url => { if (url && url.startsWith('cloud://')) fileIDs.push(url); });
      }
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls.forEach(url => { if (url && url.startsWith('cloud://')) fileIDs.push(url); });
      }
      if (post.imageUrl && post.imageUrl.startsWith('cloud://')) fileIDs.push(post.imageUrl);
      if (post.originalImageUrl && post.originalImageUrl.startsWith('cloud://')) fileIDs.push(post.originalImageUrl);
      if (post.authorAvatar && post.authorAvatar.startsWith('cloud://')) fileIDs.push(post.authorAvatar);
    });
    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) urlMap.set(item.fileID, item.tempFileURL);
        });
        posts.forEach(post => {
          if (post.imageUrl && urlMap.has(post.imageUrl)) post.imageUrl = urlMap.get(post.imageUrl);
          if (post.originalImageUrl && urlMap.has(post.originalImageUrl)) post.originalImageUrl = urlMap.get(post.originalImageUrl);
          if (post.imageUrls && Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(url => url && urlMap.has(url) ? urlMap.get(url) : url);
          }
          if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(url => url && urlMap.has(url) ? urlMap.get(url) : url);
          }
          if (post.authorAvatar && urlMap.has(post.authorAvatar)) post.authorAvatar = urlMap.get(post.authorAvatar);
        });
      } catch (fileError) {
        // 即使文件转换失败，也要返回帖子数据
      }
    }
    // 保证返回顺序与点赞时间一致
    const postIdToPost = new Map(posts.map(p => [p._id, p]));
    const orderedPosts = pagedPostIds.map(id => postIdToPost.get(id)).filter(Boolean);
    return { success: true, posts: orderedPosts };
  } catch (e) {
    return { success: false, error: e };
  }
};
