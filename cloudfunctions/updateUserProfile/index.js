const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 更新用户资料
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { avatarUrl, nickName, birthday, bio } = event;

  try {
    const updateData = {};
    // Only add fields to the update object if they are provided
    if (avatarUrl) updateData.avatarUrl = avatarUrl; // This is the new fileID
    if (nickName) updateData.nickName = nickName;
    if (birthday) updateData.birthday = birthday;
    if (bio) updateData.bio = bio;

    // Check if there is anything to update
    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '没有需要更新的内容' };
    }

    await db.collection('users').where({ _openid: openid }).update({
      data: updateData
    });

    return { success: true };

  } catch (e) {
    console.error(e);
    return { success: false, message: '数据库更新失败' };
  }
};