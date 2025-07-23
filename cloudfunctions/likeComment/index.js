
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { commentId, isLiked } = event;

  if (!commentId) {
    return { success: false, message: '缺少评论ID' };
  }

  try {
    const likesCollection = db.collection('likes');

    if (isLiked) {
      // Add a like record
      await likesCollection.add({
        data: {
          userId: openId,
          commentId: commentId,
          createTime: new Date()
        }
      });
      // Increment the likes count on the comment
      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(1)
        }
      });
    } else {
      // Remove the like record
      await likesCollection.where({
        userId: openId,
        commentId: commentId
      }).remove();
      // Decrement the likes count on the comment
      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(-1)
        }
      });
    }
    return { success: true };
  } catch (e) {
    console.error('likeComment error', e);
    return { success: false, message: '操作失败' };
  }
};
