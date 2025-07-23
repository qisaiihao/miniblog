// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { postId } = event;

  if (!postId) {
    return {
      success: false,
      message: 'Post ID is required.'
    };
  }

  try {
    // 1. 根据 postId 获取帖子详情
    const postRes = await db.collection('posts').doc(postId).get();
    const post = postRes.data;

    if (!post) {
      return {
        success: false,
        message: 'Post not found.'
      };
    }

    // 2. 根据帖子的 _openid 获取作者信息
    const userRes = await db.collection('users').where({
      _openid: post._openid
    }).get();
    
    // If author is not found, provide a default object for robustness
    const author = userRes.data[0] || { 
        nickName: '匿名用户', 
        avatarUrl: '' 
    };

    // 3. 获取当前用户的点赞记录
    const voteRes = await db.collection('votes_log').where({
        _openid: wxContext.OPENID,
        postId: postId
    }).get();

    // 4. 组合最终结果
    const resultPost = {
      ...post,
      authorName: author.nickName,
      authorAvatar: author.avatarUrl,
      isAuthor: post._openid === wxContext.OPENID,
      isVoted: voteRes.data.length > 0
    };
    // 保证 imageUrls、originalImageUrls 一定为数组
    if (!Array.isArray(resultPost.imageUrls)) resultPost.imageUrls = resultPost.imageUrls ? [resultPost.imageUrls] : [];
    if (!Array.isArray(resultPost.originalImageUrls)) resultPost.originalImageUrls = resultPost.originalImageUrls ? [resultPost.originalImageUrls] : [];

    // --- Efficiently convert FileIDs to temp URLs ---
    const fileIDs = [];
    if (resultPost.imageUrl && resultPost.imageUrl.startsWith('cloud://')) {
      fileIDs.push(resultPost.imageUrl);
    }
    if (resultPost.imageUrls && Array.isArray(resultPost.imageUrls)) {
      resultPost.imageUrls.forEach(url => {
        if (url && url.startsWith('cloud://')) {
          fileIDs.push(url);
        }
      });
    }
    if (resultPost.originalImageUrl && resultPost.originalImageUrl.startsWith('cloud://')) {
      fileIDs.push(resultPost.originalImageUrl);
    }
    if (resultPost.originalImageUrls && Array.isArray(resultPost.originalImageUrls)) {
      resultPost.originalImageUrls.forEach(url => {
        if (url && url.startsWith('cloud://')) {
          fileIDs.push(url);
        }
      });
    }
    if (resultPost.authorAvatar && resultPost.authorAvatar.startsWith('cloud://')) {
      fileIDs.push(resultPost.authorAvatar);
    }

    if (fileIDs.length > 0) {
      const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = new Map();
      fileListResult.fileList.forEach(item => {
        if (item.status === 0) {
          urlMap.set(item.fileID, item.tempFileURL);
        }
      });

      if (resultPost.imageUrl && urlMap.has(resultPost.imageUrl)) {
        resultPost.imageUrl = urlMap.get(resultPost.imageUrl);
      }
      if (resultPost.imageUrls && Array.isArray(resultPost.imageUrls)) {
        resultPost.imageUrls = resultPost.imageUrls.map(url => 
          url && urlMap.has(url) ? urlMap.get(url) : url
        );
      }
      if (resultPost.originalImageUrl && urlMap.has(resultPost.originalImageUrl)) {
        resultPost.originalImageUrl = urlMap.get(resultPost.originalImageUrl);
      }
      if (resultPost.originalImageUrls && Array.isArray(resultPost.originalImageUrls)) {
        resultPost.originalImageUrls = resultPost.originalImageUrls.map(url => 
          url && urlMap.has(url) ? urlMap.get(url) : url
        );
      }
      if (resultPost.authorAvatar && urlMap.has(resultPost.authorAvatar)) {
        resultPost.authorAvatar = urlMap.get(resultPost.authorAvatar);
      }
    }

    return {
      post: resultPost,
      success: true
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      error: e
    };
  }
};
