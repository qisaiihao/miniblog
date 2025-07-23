// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { nickName, avatarFileID } = event

  try {
    // 检查用户是否已存在
    const userRecord = await db.collection('users').where({ _openid: OPENID }).get()

    if (userRecord.data.length > 0) {
      // 用户已存在，执行更新操作
      await db.collection('users').doc(userRecord.data[0]._id).update({
        data: {
          nickName: nickName,
          avatarUrl: avatarFileID,
          updateTime: new Date()
        }
      })
      return { success: true, message: '用户信息更新成功' }
    } else {
      // 用户不存在，执行创建操作
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          nickName: nickName,
          avatarUrl: avatarFileID,
          createTime: new Date()
        }
      })
      return { success: true, message: '用户创建成功' }
    }
  } catch (e) {
    console.error(e)
    return { success: false, error: e }
  }
}
