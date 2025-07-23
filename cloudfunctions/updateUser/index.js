// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { nickName, avatarUrl } = event;

  try {
    const userRecord = await db.collection('users').where({
      _openid: wxContext.OPENID
    }).get();

    if (userRecord.data.length > 0) {
      // User exists, update it
      await db.collection('users').where({
        _openid: wxContext.OPENID
      }).update({
        data: {
          nickName,
          avatarUrl
        }
      });
    } else {
      // User does not exist, add it
      await db.collection('users').add({
        data: {
          _openid: wxContext.OPENID,
          nickName,
          avatarUrl,
          createdAt: new Date()
        }
      });
    }

    // On success, explicitly return a success object that the client expects
    return {
      success: true,
      message: 'User updated successfully.'
    };

  } catch (e) {
    console.error(e);
    // On failure, explicitly return a failure object
    return {
      success: false,
      message: 'An error occurred while updating the user.',
      error: e
    };
  }
};