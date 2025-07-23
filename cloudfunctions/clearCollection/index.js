const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { collectionName } = event // 从参数中获取要清空的集合名
  try {
    // 直接用 .where({}) 匹配所有记录，然后 .remove()
    const _ = db.command // 先获取指令符
const result = await db.collection(collectionName).where({
  _id: _.neq('a-dummy-id-that-wont-exist') // 匹配所有_id不等于一个虚拟ID的记录
}).remove()
    console.log(`成功清空集合 [${collectionName}]，删除了 ${result.stats.removed} 条记录。`);
    return {
      success: true,
      removed: result.stats.removed
    }
  } catch (e) {
    console.error(`清空集合 [${collectionName}] 失败`, e);
    return {
      success: false,
      error: e
    }
  }
}