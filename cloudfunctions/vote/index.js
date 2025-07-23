// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { postId } = event
    const { OPENID } = cloud.getWXContext()

    // 1. 查找 votes_log 表，看该用户是否已为该文章点赞
    const log = await db.collection('votes_log').where({
      _openid: OPENID,
      postId: postId
    }).get()

    let updatedPost;

    if (log.data.length > 0) {
      // 2. 如果找到了记录，说明是“取消点赞”
      await db.collection('votes_log').doc(log.data[0]._id).remove()
      await db.collection('posts').doc(postId).update({
        data: {
          votes: _.inc(-1)
        }
      })
    } else {
      // 3. 如果没找到记录，说明是“点赞”
      await db.collection('votes_log').add({
        data: {
          _openid: OPENID,
          postId: postId,
          createTime: new Date()
        }
      })
      await db.collection('posts').doc(postId).update({
        data: {
          votes: _.inc(1)
        }
      })
    }

    // 4. ���论点赞还是取消，都重新获取文章的最新数据
    updatedPost = await db.collection('posts').doc(postId).get();

    return { 
      success: true, 
      votes: updatedPost.data.votes // 返回最新的点赞数
    }

  } catch (e) {
    console.error(e)
    return {
      success: false,
      error: e
    }
  }
}