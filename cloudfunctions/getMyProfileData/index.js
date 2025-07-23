console.log('【profile云函数】=== 代码已更新 ===');

// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const $ = db.command.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }

  const { skip = 0, limit = 20 } = event;
  console.log('【profile云函数】收到分页参数:', { skip, limit });

  try {
    // Step 1: Aggregate to get user info and their posts
    const profileData = await db.collection('users').aggregate()
      .match({ _openid: openid })
      .limit(1)
      .lookup({
        from: 'posts',
        let: { user_openid: '$_openid' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_openid', '$$user_openid'] } } },
          { $sort: { createTime: -1 } },
          { $skip: skip },
          { $limit: limit }
        ],
        as: 'userPosts',
      })
      .project({
        _id: 1,
        nickName: 1,
        avatarUrl: 1, // This is a fileID
        birthday: 1, // 新增：获取生日
        bio: 1,      // 新增：获取个性签名
        posts: '$userPosts'
      })
      .end();

    if (profileData.list.length === 0) {
      return { success: false, message: 'User not found.' };
    }

    const result = profileData.list[0];
    let userInfo = { 
      nickName: result.nickName, 
      avatarUrl: result.avatarUrl, // fileID
      birthday: result.birthday,
      bio: result.bio
    };
    let posts = result.posts || []; // 这里已经是分页后的 posts
    console.log('【profile云函数】聚合后 posts 数量:', posts.length);

    // Step 2: Aggregate to get comment counts for the posts
    if (posts.length > 0) {
      const postIds = posts.map(p => p._id);
      const commentsCountRes = await db.collection('comments').aggregate()
        .match({ postId: db.command.in(postIds) })
        .group({ _id: '$postId', count: $.sum(1) })
        .end();

      const commentsCountMap = new Map();
      commentsCountRes.list.forEach(item => {
        commentsCountMap.set(item._id, item.count);
      });

      posts = posts.map(post => ({
        ...post,
        commentCount: commentsCountMap.get(post._id) || 0
      }));
      posts.sort((a, b) => b.createTime - a.createTime);
    }

    // --- Efficiently convert FileIDs to temp URLs ---
    const fileIDSet = new Set(); // 使用Set避免重复
    posts.forEach((post, index) => {
      console.log(`处理第${index + 1}个帖子的图片字段:`, {
        imageUrl: post.imageUrl,
        imageUrls: post.imageUrls,
        originalImageUrl: post.originalImageUrl,
        originalImageUrls: post.originalImageUrls,
        authorAvatar: userInfo.avatarUrl
      });
      
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 特殊处理：如果imageUrl有值但imageUrls为空，将imageUrl添加到imageUrls中
      if (post.imageUrl && (!post.imageUrls || post.imageUrls.length === 0)) {
        post.imageUrls = [post.imageUrl];
      }
      if (post.originalImageUrl && (!post.originalImageUrls || post.originalImageUrls.length === 0)) {
        post.originalImageUrls = [post.originalImageUrl];
      }
      
      // 收集唯一的fileID，优先使用imageUrls和originalImageUrls
      if (post.imageUrls && Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      } else if (post.imageUrl && post.imageUrl.startsWith('cloud://')) {
        // 只有当imageUrls为空时才使用imageUrl
        fileIDSet.add(post.imageUrl);
      }
      
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls) && post.originalImageUrls.length > 0) {
        post.originalImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      } else if (post.originalImageUrl && post.originalImageUrl.startsWith('cloud://')) {
        // 只有当originalImageUrls为空时才使用originalImageUrl
        fileIDSet.add(post.originalImageUrl);
      }
      
      if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        fileIDSet.add(userInfo.avatarUrl);
      }
    });
    
    const fileIDs = Array.from(fileIDSet);

    console.log('需要转换的fileID数量:', fileIDs.length);
    console.log('fileID列表:', fileIDs);

    if (fileIDs.length > 0) {
      try {
        // 分批处理，每批最多50个文件
        const batchSize = 50;
        const urlMap = new Map();
        
        for (let i = 0; i < fileIDs.length; i += batchSize) {
          const batch = fileIDs.slice(i, i + batchSize);
          console.log(`处理第${Math.floor(i/batchSize) + 1}批，文件数量: ${batch.length}`);
          
          const fileListResult = await cloud.getTempFileURL({ fileList: batch });
          console.log('getTempFileURL返回结果:', fileListResult);
          
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
        }

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
          if (userInfo.avatarUrl && urlMap.has(userInfo.avatarUrl)) {
            userInfo.avatarUrl = urlMap.get(userInfo.avatarUrl);
            console.log('转换authorAvatar:', userInfo.avatarUrl);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
        // 即使文件转换失败，也要返回帖子数据
      }
    }

    // 图片URL转换完成后，给每个post加上作者信息
    posts = posts.map(post => ({
      ...post,
      authorName: userInfo.nickName,
      authorAvatar: userInfo.avatarUrl
    }));

    console.log('【profile云函数】最终返回 posts 数量:', posts.length);

    return {
      success: true,
      userInfo: userInfo,
      posts: posts // 只返回分页后的
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      error: e
    };
  }
};
