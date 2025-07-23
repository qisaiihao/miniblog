// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }

  try {
    // 1. 查找用户点赞的所有记录
    const votesResult = await db.collection('votes_log')
      .where({ _openid: openid })
      .orderBy('likeTime', 'desc')
      .get();

    if (votesResult.data.length === 0) {
      return { 
        success: true, 
        posts: [],
        message: '暂无点赞记录'
      };
    }

    // 2. 获取所有点赞的帖子ID
    const postIds = votesResult.data.map(vote => vote.postId);
    // 分页处理postIds
    const { skip = 0, limit = 5 } = event;
    const pagedPostIds = postIds.slice(skip, skip + limit);
    if (pagedPostIds.length === 0) {
      return { success: true, posts: [], message: '暂无更多点赞记录' };
    }
    // 3. 获取帖子详情（只查分页后的）
    const postsResult = await db.collection('posts')
      .where({ _id: db.command.in(pagedPostIds) })
      .get();

    console.log('查询到的帖子数量:', postsResult.data.length);
    console.log('帖子详情:', postsResult.data.map(post => ({
      _id: post._id,
      _openid: post._openid,
      title: post.title,
      content: post.content
    })));

    // 4. 获取所有帖子作者的用户信息
    const authorOpenids = [...new Set(postsResult.data.map(post => post._openid))];
    console.log('需要查询的用户openid:', authorOpenids);
    
    // 先查询所有用户记录，看看users集合中有什么
    const allUsersResult = await db.collection('users').get();
    console.log('users集合中的所有记录数量:', allUsersResult.data.length);
    console.log('users集合中的所有记录:', allUsersResult.data);
    
    const usersResult = await db.collection('users')
      .where({ _openid: db.command.in(authorOpenids) })
      .get();

    console.log('查询到的用户记录数量:', usersResult.data.length);
    console.log('用户记录详情:', usersResult.data);

    // 5. 创建用户信息映射
    const userMap = new Map();
    usersResult.data.forEach(user => {
      console.log('处理用户记录:', {
        _openid: user._openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl
      });
      userMap.set(user._openid, {
        nickName: user.nickName,
        avatarUrl: user.avatarUrl
      });
    });

    // 6. 组合帖子信息和用户信息
    let posts = postsResult.data.map(post => {
      const userInfo = userMap.get(post._openid) || { nickName: '匿名用户', avatarUrl: '' };
      console.log('组合帖子信息:', {
        postId: post._id,
        postOpenid: post._openid,
        userInfo: userInfo,
        finalAuthorName: userInfo.nickName,
        userMapSize: userMap.size,
        userMapKeys: Array.from(userMap.keys())
      });
      return {
        ...post,
        authorName: userInfo.nickName,
        authorAvatar: userInfo.avatarUrl,
        likeTime: votesResult.data.find(vote => vote.postId === post._id)?.likeTime
      };
    });

    // 7. 计算每个帖子的评论数
    const commentsRes = await db.collection('comments').aggregate()
      .match({ postId: db.command.in(pagedPostIds) })
      .group({
        _id: '$postId',
        totalComments: db.command.aggregate.sum(1)
      })
      .end();

    const commentCountMap = new Map();
    commentsRes.list.forEach(item => {
      commentCountMap.set(item._id, item.totalComments);
    });

    // 8. 将评论数添加到帖子中
    posts = posts.map(post => ({
      ...post,
      commentCount: commentCountMap.get(post._id) || 0
    }));

    // 9. 转换图片URL
    const fileIDs = [];
    posts.forEach(post => {
      if (post.imageUrl && post.imageUrl.startsWith('cloud://')) {
        fileIDs.push(post.imageUrl);
      }
      if (post.imageUrls && Array.isArray(post.imageUrls)) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (post.originalImageUrl && post.originalImageUrl.startsWith('cloud://')) {
        fileIDs.push(post.originalImageUrl);
      }
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (post.authorAvatar && post.authorAvatar.startsWith('cloud://')) {
        fileIDs.push(post.authorAvatar);
      }
    });

    // 分批处理文件转换，每次最多50个
    const urlMap = new Map();
    if (fileIDs.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < fileIDs.length; i += batchSize) {
        const batch = fileIDs.slice(i, i + batchSize);
        try {
          const fileListResult = await cloud.getTempFileURL({ fileList: batch });
          fileListResult.fileList.forEach(item => {
            if (item.status === 0) {
              urlMap.set(item.fileID, item.tempFileURL);
            }
          });
        } catch (error) {
          console.error('转换文件URL失败:', error);
        }
      }
    }

    // 将转换后的URL应用到帖子对象
    posts.forEach(post => {
      if (post.imageUrl && urlMap.has(post.imageUrl)) {
        post.imageUrl = urlMap.get(post.imageUrl);
      }
      if (post.imageUrls && Array.isArray(post.imageUrls)) {
        post.imageUrls = post.imageUrls.map(url => 
          url && urlMap.has(url) ? urlMap.get(url) : url
        );
      }
      if (post.originalImageUrl && urlMap.has(post.originalImageUrl)) {
        post.originalImageUrl = urlMap.get(post.originalImageUrl);
      }
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls = post.originalImageUrls.map(url => 
          url && urlMap.has(url) ? urlMap.get(url) : url
        );
      }
      if (post.authorAvatar && urlMap.has(post.authorAvatar)) {
        post.authorAvatar = urlMap.get(post.authorAvatar);
      }
    });

    // 添加调试日志
    console.log('获取到的点赞帖子数量:', posts.length);
    if (posts.length > 0) {
      console.log('第一个帖子的作者信息:', {
        authorName: posts[0].authorName,
        authorAvatar: posts[0].authorAvatar,
        _openid: posts[0]._openid
      });
    }

    return {
      success: true,
      posts: posts,
      message: `共找到 ${posts.length} 条点赞记录`
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      error: e
    };
  }
};
