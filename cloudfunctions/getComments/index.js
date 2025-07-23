// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { postId, skip = 0, limit = 20 } = event;

  if (!postId) {
    return { success: false, message: 'Post ID is required.' };
  }

  try {
    // 1. Get all comments for the post (both parent and child comments)
    const commentsRes = await db.collection('comments')
      .where({
        postId: postId
      })
      .orderBy('createTime', 'asc') // Show oldest comments first
      .get();
    
    let allComments = commentsRes.data;

    if (allComments.length === 0) {
      return {
        success: true,
        comments: []
      };
    }

    // 2. Separate parent and child comments
    const parentComments = allComments.filter(comment => !comment.parentId);
    const childComments = allComments.filter(comment => comment.parentId);

    // 3. Get the openids of all commenters
    const openids = allComments.map(comment => comment._openid);
    const uniqueOpenids = [...new Set(openids)]; // Remove duplicates

    // 4. Get the user info for all commenters
    const usersRes = await db.collection('users').where({
      _openid: db.command.in(uniqueOpenids)
    }).get();
    
    const usersMap = new Map();
    usersRes.data.forEach(user => {
      usersMap.set(user._openid, {
        nickName: user.nickName,
        avatarUrl: user.avatarUrl
      });
    });

    // 5. Join the user info into the comments
    const processComments = (comments) => {
      return comments.map(comment => {
        // Provide a default author object if the user is not found
        const author = usersMap.get(comment._openid) || { 
          nickName: '匿名用户', 
          avatarUrl: '' // Use a default placeholder avatar if you have one
        };
        return {
          ...comment,
          authorName: author.nickName,
          authorAvatar: author.avatarUrl
        };
      });
    };

    const processedParentComments = processComments(parentComments);
    const processedChildComments = processComments(childComments);

    // 6. Organize child comments under their parents
    const childCommentsMap = new Map();
    processedChildComments.forEach(child => {
      if (!childCommentsMap.has(child.parentId)) {
        childCommentsMap.set(child.parentId, []);
      }
      childCommentsMap.get(child.parentId).push(child);
    });

    // 7. Add child comments to their parent comments
    const resultComments = processedParentComments.map(parent => ({
      ...parent,
      replies: childCommentsMap.get(parent._id) || []
    }));

    // 8. Get the user's like status for all comments
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;
    const allCommentIds = allComments.map(c => c._id);
    const likesRes = await db.collection('likes').where({
      userId: openId,
      commentId: db.command.in(allCommentIds)
    }).get();
    const userLikedCommentIds = new Set(likesRes.data.map(like => like.commentId));

    // 9. Add like status to all comments (parent and child)
    const addLikeStatus = (comments) => {
      comments.forEach(comment => {
        comment.liked = userLikedCommentIds.has(comment._id);
        comment.likes = comment.likes || 0;
        if (comment.replies) {
          addLikeStatus(comment.replies);
        }
      });
    };
    addLikeStatus(resultComments);

    // 10. Convert FileIDs to temp URLs for all comments
    const getAllAvatars = (comments) => {
      let avatars = [];
      comments.forEach(comment => {
        if (comment.authorAvatar && comment.authorAvatar.startsWith('cloud://')) {
          avatars.push(comment.authorAvatar);
        }
        if (comment.replies) {
          avatars = avatars.concat(getAllAvatars(comment.replies));
        }
      });
      return avatars;
    };

    const fileIDs = getAllAvatars(resultComments);
    if (fileIDs.length > 0) {
      const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = new Map();
      fileListResult.fileList.forEach(item => {
        if (item.status === 0) {
          urlMap.set(item.fileID, item.tempFileURL);
        }
      });

      const updateAvatars = (comments) => {
        comments.forEach(comment => {
          if (comment.authorAvatar && urlMap.has(comment.authorAvatar)) {
            comment.authorAvatar = urlMap.get(comment.authorAvatar);
          }
          if (comment.replies) {
            updateAvatars(comment.replies);
          }
        });
      };
      updateAvatars(resultComments);
    }

    return {
      success: true,
      comments: resultComments,
      userLikes: Array.from(userLikedCommentIds) // Send back the set of liked comment IDs
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: 'Failed to get comments.',
      error: e
    };
  }
};
