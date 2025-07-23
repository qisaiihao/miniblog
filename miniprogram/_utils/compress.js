// compressImage.js
/**
 * @param {object} img 包含path：图片的path，size：图片的大小
 * @param {object} canvas canvas对象
 * @param {number} fileLimit 文件大小限制
 * @returns {Promise} 返回Promise对象
 */
function _compressImage(img, canvas, fileLimit) {
    return wx.getSystemInfo().then(res => {
      let {
        // 设备像素比
        pixelRatio,
        // 设备品牌
        system
      } = res;
      // 是否是IOS系统
      let isIOS = /(ios)/ig.test(system);
      // 文件限制
      fileLimit = fileLimit || 2 * 1024 * 1024;
      // 基础大小
      let baseSize = 1280;
      // 大于文件限制，手动压缩
      if (img.size > fileLimit) {
        return compressImg({src:img.path, size:img.size, canvas, baseSize, isIOS, pixelRatio}).then(response => {
          return Promise.resolve(response);
        });
      }
      return Promise.resolve(img.path);
    });
  }
  
  /**
   * @description 根据图片的大小选择压缩的方式
   * @param {string} src 图片的path
   * @param {number} size 图片的大小
   * @param {object} canvas canvas对象
   * @param {number} baseSize 基础尺寸
   * @param {boolean} isIOS 是否是IOS系统 
   * @returns {Promise} 返回Promise对象
   */
  function compressImg({src, size, canvas, baseSize, isIOS, pixelRatio}) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src
      }).then(res => {
        let imgWidth = res.width;
        let imgHeight = res.height;
        if (imgWidth <= 4096 && imgHeight <= 4096) {
          // 小于4096使用canvas压缩
          canvasToImage({src, size, imgWidth, imgHeight, canvas, baseSize, isIOS, pixelRatio}).then(response => {
            resolve(response);
          });
        } else {
          // 超过4096使用强制压缩
          compressImage(src, size, isIOS).then(response => {
            resolve(response);
          });
        }
      }).catch(err => {
        // 使用强制压缩
        compressImage(src, size, isIOS).then(response => {
          resolve(response);
        });
      });
    });
  }
  
  /**
   * @description 使用wx.compressImage压缩图片
   * @param {string} src 图片的path
   * @param {number} size 图片的大小
   * @param {boolean} isIOS 是否是IOS系统
   * @returns {Promise} 返回Promise对象
   */
  function compressImage(src, size, isIOS) {
    return new Promise((resolve, reject) => {
      let quality = 100;
      if (isIOS) {
        quality = 0.1;
      } else {
        let temp = 30 - (size / 1024 / 1024);
        quality = temp < 10 ? 10 : temp;
      }
      wx.compressImage({
        src,
        quality,
        success: (res) => {
          resolve(res.tempFilePath);
        },
        fail: () => {
          // 压缩失败返回传递的图片src
          resolve(src);
        }
      });
    });
  }
  
  /**
   * @description 使用canvans压缩图片
   * @param {string} src 图片的path
   * @param {number} size 图片的大小
   * @param {number} imgWidth 图片的宽度
   * @param {number} imgHeight 图片的高度
   * @param {object} canvas canvas对象
   * @param {number} baseSize 基础尺寸
   * @param {boolean} isIOS 是否是IOS系统
   * @param {number} pixelRatio 设备像素比
   * @returns {Promise} 返回Promise对象
   */
  function canvasToImage({src, size, imgWidth, imgHeight, canvas, baseSize, isIOS, pixelRatio}) {
    return new Promise((resolve, reject) => {
      if (!canvas) {
        compressImage(src, size).then(res => {
          resolve(res);
        });
        return;
      }
      // 设置canvas宽度和高度
      let canvasWidth = 0;
      let canvasHeight = 0;
      let quality = 1;
      // 图片的宽度和高度都小于baseSize，宽高不变
      if (imgWidth <= baseSize && imgHeight <= baseSize) {
        canvasWidth = imgWidth;
        canvasHeight = imgHeight;
        quality = 0.3;
      } else {
        let compareFlag = true;
        // 图片的一边大于baseSize，宽高不变
        if (pixelRatio > 2 && (imgWidth > baseSize || imgHeight > baseSize) && (imgWidth < baseSize || imgHeight < baseSize)) {
          canvasWidth = imgWidth;
          canvasHeight = imgHeight;
          quality = 0.3;
        } else {
          // 按照原图的宽高比压缩
          compareFlag = pixelRatio > 2 ? (imgWidth > imgHeight) : (imgWidth > imgHeight);
          // 宽比高大，宽按基准比例缩放，高设置为基准值，高比宽大，高按基准比例缩放，宽设置为基准值。
          canvasWidth = compareFlag ? parseInt(imgWidth / (imgHeight / baseSize)) : baseSize;
          canvasHeight = compareFlag ? baseSize : parseInt(imgHeight / (imgwidth / baseSize));
          quality = 0.9;
        }
      }
      let pic = canvas.createImage();
      pic.src = src;
      pic.onerror = function () {
        // 加载失败使用强制压缩
        compressImage(src, size, isIOS).then(response => {
          resolve(response);
        });
      }
      pic.onload = function () {
        // 获取绘画上下文
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(pic, 0, 0, canvasWidth, canvasHeight);
        // 导出图片
        wx.canvasToTempFilePath({
          canvas,
          width: canvasWidth,
          height: canvasHeight,
          destHeight: canvasHeight,
          destWidth: canvasWidth,
          fileType:'jpg',
          quality,
          success: (res) => {
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            // 压缩失败使用强制压缩
            compressImage(src, size, isIOS).then(response => {
              resolve(response);
            });
          }
        });
      }
    });
  }
  
  /**
   * @description 循环压缩图片
   * @param {object} img 包含path：图片的path，size：图片的大小
   * @param {object} canvas canvas对象
   * @param {number} fileLimit 文件大小限制
   * @returns {Promise} 返回Promise对象
   */
  async function cycleCompressImg(img, canvas, fileLimit) {
    let fileSystemManager = wx.getFileSystemManager();
  
    function getFileInfoPromise(src) {
      return new Promise((resolve, reject) => {
        fileSystemManager.getFileInfo({
          filePath: src,
          success: (res) => {
            resolve(res);
          },
          fail: (err) => {
            reject(err);
          }
        });
      });
    }
    let size = await getFileInfoPromise(img.path).size;
    let path = img.path;
    while (size > fileLimit) {
      path = await _compressImage(img, canvas, fileLimit);
    }
    return path;
  }
  
  module.exports = {
    compressImage: _compressImage // 我们只导出这一个核心函数，并给它起个好记的名字
  };
  