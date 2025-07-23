const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { postId } = event;
  const wxContext = cloud.getWXContext();
  const currentUserOpenId = wxContext.OPENID; // 获取当前用户的 openid

  try {
    // 1. 根据 postId 获取帖子的信息
    const postResult = await db.collection('posts').doc(postId).get();
    const post = postResult.data;

    // 2. 权限校验：检查当前用户的 openid 是否与帖子的 _openid 匹配
    if (post._openid !== currentUserOpenId) {
      return {
        success: false,
        message: '权限不足，无法删除他人帖子'
      };
    }

    // 3. 校验通过，执行删除操作
    const result = await db.collection('posts').doc(postId).remove();

    if (result.stats.removed === 1) {
      return {
        success: true,
        message: '删除成功'
      };
    } else {
      // 这种情况理论上不应该发生，因为前面已经查询过一次了
      return {
        success: false,
        message: '未找到对应记录或删除失败'
      };
    }
  } catch (e) {
    console.error('删除帖子失败', e);
    return {
      success: false,
      error: e.message // 返回更清晰的错误信息
    };
  }
};
