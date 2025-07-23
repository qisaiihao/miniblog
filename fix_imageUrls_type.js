// 用于修复 posts 表中 imageUrls 字段为字符串的历史数据
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 或直接写你的环境ID
});
const db = cloud.database();

async function fixImageUrls() {
  const BATCH_SIZE = 100;
  let total = 0;
  let fixed = 0;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await db.collection('posts').skip(skip).limit(BATCH_SIZE).get();
    const posts = res.data;
    if (posts.length === 0) break;
    total += posts.length;
    for (const post of posts) {
      if (post.imageUrls && typeof post.imageUrls === 'string') {
        // 尝试用逗号分割
        let arr = [];
        try {
          arr = JSON.parse(post.imageUrls);
          if (!Array.isArray(arr)) arr = post.imageUrls.split(',');
        } catch {
          arr = post.imageUrls.split(',');
        }
        await db.collection('posts').doc(post._id).update({
          data: { imageUrls: arr }
        });
        fixed++;
        console.log(`已修复 postId: ${post._id}, imageUrls:`, arr);
      }
    }
    skip += posts.length;
    hasMore = posts.length === BATCH_SIZE;
  }
  console.log(`总共检查 ${total} 条，修复 ${fixed} 条 imageUrls 类型。`);
}

fixImageUrls().catch(console.error); 