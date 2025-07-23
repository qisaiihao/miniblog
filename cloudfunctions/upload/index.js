// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const res = await cloud.uploadFile({
      cloudPath: event.cloudPath, // 文件在云端的路径，由前端传过来
      fileContent: Buffer.from(event.fileContent, 'base64'), // 文件的二进制内容，由前端传过来
    });
    return {
      fileID: res.fileID,
      cloudPath: event.cloudPath // 把前端传过来的cloudPath再传回去
    };
  } catch (e) {
    console.error(e);
    return e;
  }
}