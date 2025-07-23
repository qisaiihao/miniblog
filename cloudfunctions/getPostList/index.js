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
  const { skip = 0, limit = 10 } = event;

  try {
    console.log('开始获取帖子列表，参数:', { skip, limit });
    
    const postsRes = await db.collection('posts').aggregate()
      .sort({ createTime: -1 })
      .skip(skip)
      .limit(limit)
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
      // 关联当前用户的点赞记录 (兼容旧版SDK的写法)
      .lookup({
        from: 'votes_log',
        let: {
          post_id: '$_id'
        },
        // 使用JSON对象替代.pipeline().build()
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$postId', '$$post_id'] },
                  { $eq: ['$_openid', wxContext.OPENID] }
                ]
              }
            }
          }
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

    const posts = postsRes.list;
    console.log('查询到帖子数量:', posts.length);

    // --- Efficiently convert FileIDs to temp URLs ---
    const fileIDs = [];
    posts.forEach((post, index) => {
      console.log(`处理第${index + 1}个帖子的图片字段:`, {
        imageUrl: post.imageUrl,
        imageUrls: post.imageUrls,
        originalImageUrl: post.originalImageUrl,
        originalImageUrls: post.originalImageUrls,
        authorAvatar: post.authorAvatar
      });
      
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 下面保持原有 fileID 收集逻辑
      if (post.imageUrls && Array.isArray(post.imageUrls)) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (post.imageUrl && post.imageUrl.startsWith('cloud://')) {
        fileIDs.push(post.imageUrl);
      }
      if (post.originalImageUrl && post.originalImageUrl.startsWith('cloud://')) {
        fileIDs.push(post.originalImageUrl);
      }
      if (post.authorAvatar && post.authorAvatar.startsWith('cloud://')) {
        fileIDs.push(post.authorAvatar);
      }
    });

    console.log('需要转换的fileID数量:', fileIDs.length);
    console.log('fileID列表:', fileIDs);

    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        console.log('getTempFileURL返回结果:', fileListResult);
        
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          console.log('处理文件转换结果:', {
            fileID: item.fileID,
            status: item.status,
            tempFileURL: item.tempFileURL,
            errMsg: item.errMsg
          });
          
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          } else {
            console.error('文件转换失败:', item.fileID, item.errMsg);
          }
        });

        console.log('成功转换的URL数量:', urlMap.size);

              posts.forEach((post, index) => {
          console.log(`转换第${index + 1}个帖子的图片URL`);
          
          if (post.imageUrl && urlMap.has(post.imageUrl)) {
            post.imageUrl = urlMap.get(post.imageUrl);
            console.log('转换imageUrl:', post.imageUrl);
          }
          if (post.originalImageUrl && urlMap.has(post.originalImageUrl)) {
            post.originalImageUrl = urlMap.get(post.originalImageUrl);
            console.log('转换originalImageUrl:', post.originalImageUrl);
          }
          if (post.imageUrls && Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(url => {
              if (url && urlMap.has(url)) {
                const convertedUrl = urlMap.get(url);
                console.log('转换imageUrls中的URL:', url, '->', convertedUrl);
                return convertedUrl;
              }
              return url;
            });
          }
          if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(url => {
              if (url && urlMap.has(url)) {
                const convertedUrl = urlMap.get(url);
                console.log('转换originalImageUrls中的URL:', url, '->', convertedUrl);
                return convertedUrl;
              }
              return url;
            });
          }
          if (post.authorAvatar && urlMap.has(post.authorAvatar)) {
            post.authorAvatar = urlMap.get(post.authorAvatar);
            console.log('转换authorAvatar:', post.authorAvatar);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
        // 即使文件转换失败，也要返回帖子数据
      }
    }

    console.log('最终返回的帖子数据示例:', posts.length > 0 ? {
      _id: posts[0]._id,
      title: posts[0].title,
      imageUrls: posts[0].imageUrls,
      authorAvatar: posts[0].authorAvatar
    } : '无帖子数据');

    return {
      success: true,
      posts: posts
    };

  } catch (e) {
    console.error("CRITICAL ERROR in getPostList:", e);
    return {
      success: false,
      error: {
        message: e.message,
        stack: e.stack
      }
    };
  }
};