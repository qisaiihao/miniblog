// pages/add/add.js
const db = wx.cloud.database();

Page({
  data: {
    title: '',
    content: '',
    imageList: [], // 图片列表，包含原图和压缩图信息
    maxImageCount: 9 // 最大图片数量
  },

  onTitleInput: function(event) { 
    this.setData({ title: event.detail.value }); 
  },
  
  onContentInput: function(event) { 
    this.setData({ content: event.detail.value }); 
  },

  handleChooseImage: function() {
    const that = this;
    const remainingCount = this.data.maxImageCount - this.data.imageList.length;
    
    if (remainingCount <= 0) {
      wx.showToast({ title: '最多只能上传9张图片', icon: 'none' });
      return;
    }
    
    console.log('开始选择图片，剩余数量:', remainingCount);
    wx.chooseImage({
      count: remainingCount,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        console.log('选择图片成功:', res.tempFilePaths);
        
        const newImages = [];
        let processedCount = 0;
        
        res.tempFilePaths.forEach((tempFilePath, index) => {
          wx.getImageInfo({
            src: tempFilePath,
            success: (info) => {
              console.log('获取图片信息成功:', info);
              const sizeInBytes = info.size;
              const sizeInKB = Math.round(sizeInBytes / 1024);
              const needCompression = sizeInBytes > 300 * 1024;
              
              console.log('图片大小:', sizeInKB + 'KB, 需要压缩:', needCompression);
              
              const imageInfo = {
                originalPath: tempFilePath,
                imageSize: sizeInBytes,
                needCompression: needCompression,
                previewUrl: tempFilePath,
                compressedPath: tempFilePath,
                originalUrl: '',
                compressedUrl: ''
              };
              
              newImages.push(imageInfo);
              
              if (needCompression) {
                that.compressImage(imageInfo, newImages.length - 1);
              } else {
                imageInfo.compressedPath = tempFilePath;
                imageInfo.previewUrl = tempFilePath;
              }
              
              processedCount++;
              if (processedCount === res.tempFilePaths.length) {
                that.updateImageList(newImages);
              }
            },
            fail: (err) => {
              console.log('获取图片信息失败:', err);
              const imageInfo = {
                originalPath: tempFilePath,
                needCompression: true,
                previewUrl: tempFilePath,
                compressedPath: tempFilePath,
                originalUrl: '',
                compressedUrl: ''
              };
              
              newImages.push(imageInfo);
              that.compressImage(imageInfo, newImages.length - 1);
              
              processedCount++;
              if (processedCount === res.tempFilePaths.length) {
                that.updateImageList(newImages);
              }
            }
          });
        });
      },
      fail: (err) => {
        console.log('选择图片失败:', err);
      }
    });
  },

  compressImage: function(imageInfo, index) {
    const that = this;
    console.log('开始压缩图片:', index);
    
    wx.compressImage({
      src: imageInfo.originalPath,
      quality: 80,
      success: (compressRes) => {
        console.log('压缩成功:', compressRes.tempFilePath);
        imageInfo.compressedPath = compressRes.tempFilePath;
        imageInfo.previewUrl = compressRes.tempFilePath;
      },
      fail: (err) => {
        console.log('压缩失败:', err);
        imageInfo.compressedPath = imageInfo.originalPath;
        imageInfo.previewUrl = imageInfo.originalPath;
      }
    });
  },

  updateImageList: function(newImages) {
    const currentList = this.data.imageList;
    const updatedList = currentList.concat(newImages);
    this.setData({
      imageList: updatedList
    });
  },

  removeImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const imageList = this.data.imageList;
    imageList.splice(index, 1);
    this.setData({
      imageList: imageList
    });
  },
  
  submitPost: function() {
    const hasImages = this.data.imageList.length > 0;
    const hasTitle = this.data.title && this.data.title.trim();
    const hasContent = this.data.content && this.data.content.trim();
    
    if (!hasImages && !hasTitle && !hasContent) {
      wx.showToast({ title: '请至少上传图片或输入内容', icon: 'none' });
      return;
    }
    
    if (hasTitle && !hasContent) {
      wx.showToast({ title: '请输入正文内容', icon: 'none' });
      return;
    }
    
    console.log('提交帖子:', {
      imageList: this.data.imageList,
      title: this.data.title,
      content: this.data.content
    });
    
    wx.showLoading({ title: '发布中...' });

    if (this.data.imageList.length > 0) {
      this.uploadImagesAndSubmit();
    } else {
      this.submitTextOnly();
    }
  },
  
  uploadImagesAndSubmit: function() {
    const that = this;
    const timestamp = new Date().getTime();
    const imageList = this.data.imageList;
    
    console.log('开始上传图片:', imageList.length + '张');

    const uploadPromises = imageList.map((imageInfo, index) => {
      return new Promise((resolve, reject) => {
        const imageTimestamp = timestamp + index;
        const compressedCloudPath = `post_images/${imageTimestamp}_compressed.jpg`;
        
        wx.cloud.uploadFile({
          cloudPath: compressedCloudPath,
          filePath: imageInfo.compressedPath,
        }).then(compressedRes => {
          console.log('压缩图上传成功:', compressedRes.fileID);
          const compressedFileID = compressedRes.fileID;
          
          if (imageInfo.needCompression) {
            const originalCloudPath = `post_images/${imageTimestamp}_original.jpg`;
            return wx.cloud.uploadFile({
              cloudPath: originalCloudPath,
              filePath: imageInfo.originalPath,
            }).then(originalRes => {
              console.log('原图上传成功:', originalRes.fileID);
              resolve({
                compressedUrl: compressedFileID,
                originalUrl: originalRes.fileID
              });
            });
          } else {
            resolve({
              compressedUrl: compressedFileID,
              originalUrl: compressedFileID
            });
          }
        }).catch(reject);
      });
    });

    Promise.all(uploadPromises).then(uploadResults => {
      console.log('所有图片上传完成:', uploadResults);
      return that.submitToDatabase(uploadResults);
    }).catch(err => {
      console.error('上传失败:', err);
      that.publishFail(err);
    });
  },

  submitToDatabase: function(uploadResults) {
    console.log('提交到数据库:', {
      uploadResults: uploadResults,
      title: this.data.title,
      content: this.data.content
    });
    
    const imageUrls = uploadResults.map(result => result.compressedUrl);
    const originalImageUrls = uploadResults.map(result => result.originalUrl);
    
    const postData = {
      title: this.data.title,
      content: this.data.content,
      createTime: new Date(),
      votes: 0
    };
    
    if (imageUrls.length > 0) {
      postData.imageUrl = imageUrls[0];
      postData.imageUrls = imageUrls;
      postData.originalImageUrl = originalImageUrls[0];
      postData.originalImageUrls = originalImageUrls;
    }
    
    return db.collection('posts').add({
      data: postData
    }).then(res => {
      console.log('数据库提交成功:', res);
      this.publishSuccess(res);
    }).catch(err => {
      console.error('数据库提交失败:', err);
      this.publishFail(err);
    });
  },

  submitTextOnly: function() {
    this.submitToDatabase([]);
  },

  publishSuccess: function(res) {
    wx.hideLoading();
    wx.showToast({ title: '发布成功！' });
    wx.navigateBack({ delta: 1 });
  },

  publishFail: function(err) {
    wx.hideLoading();
    wx.showToast({ title: '发布失败', icon: 'none' });
    console.error('[发布流程] 失败：', err);
  },

  // 新增：图片加载失败反馈
  onImageError: function(e) {
    wx.showToast({ title: '图片加载失败', icon: 'none' });
    console.error('图片加载失败', e);
  }
})