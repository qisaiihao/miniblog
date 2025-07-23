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

  const { postId, content, parentId } = event;

  // Basic validation
  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }
  if (!postId || !content) {
    return { success: false, message: 'Post ID and content are required.' };
  }
  if (content.trim().length === 0) {
    return { success: false, message: 'Comment content cannot be empty.' };
  }

  try {
    // Prepare comment data
    const commentData = {
      _openid: openid,
      postId: postId,
      content: content,
      createTime: new Date()
    };

    // If parentId is provided, this is a reply to another comment
    if (parentId) {
      commentData.parentId = parentId;
    }

    // Add the new comment to the database
    const result = await db.collection('comments').add({
      data: commentData
    });

    return {
      success: true,
      message: 'Comment added successfully.',
      commentId: result._id
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: 'Failed to add comment.',
      error: e
    };
  }
};
