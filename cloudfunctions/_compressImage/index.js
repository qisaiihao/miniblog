const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { fileID } = event
  try {
    // 1. 获取原始文件的临时下载链接
    const tempFileRes = await cloud.getTempFileURL({
      fileList: [fileID]
    })
    const tempFileURL = tempFileRes.fileList[0].tempFileURL

    // 2. ★ 在临时链接后，手动拼接图片处理指令 ★
    // 这是数据万象最经典的图片处理URL格式
    const transformedURL = tempFileURL + '?imageMogr2/thumbnail/800x/quality/85'

    // 3. 使用 axios 下载“处理后”的图片内容
    const response = await axios({
      url: transformedURL,
      method: 'GET',
      responseType: 'arraybuffer' 
    })
    const compressedFileContent = response.data

    // 4. 生成压缩后文件的云端路径
    const compressedCloudPath = 'compressed/' + fileID.split('/').pop();

    // 5. 上传“压缩后”的二进制内容
    const uploadResult = await cloud.uploadFile({
      cloudPath: compressedCloudPath,
      fileContent: compressedFileContent
    })
    
    console.log('压缩并上传成功', uploadResult);

    return {
      success: true,
      compressedFileID: uploadResult.fileID
    }

  } catch (err) {
    console.error('压缩失败', err)
    return {
      success: false,
      error: err
    }
  }
}