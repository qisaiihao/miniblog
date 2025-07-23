// pages/login/login.js
const app = getApp();

Page({
  data: {
    avatarFileID: '', // Changed from avatarUrl to avoid confusion
    nickName: '',
    openidReady: false, // Flag to control the button state
    localAvatarTempPath: '', // Property to store local temp path
    isSaving: false, // Flag to prevent duplicate save operations
  },

  onLoad: function() {
    if (app.globalData.openid) {
      this.setData({
        openidReady: true,
      });
    } else {
      // Set a callback to be executed when openid is ready
      app.globalData.openidReadyCallback = openid => {
        this.setData({
          openidReady: true,
        });
      };
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail; // This is the local temp path from the component
    this.setData({
      localAvatarTempPath: avatarUrl, // Store the local temp path for display
      avatarFileID: '', // Clear the old fileID to indicate a new upload is needed
    });
    // Immediately trigger the upload
    this.uploadAvatar(avatarUrl);
  },

  onNicknameInput(e) {
    this.setData({
      nickName: e.detail.value
    });
  },

  uploadAvatar: function(tempFilePath) {
    if (!tempFilePath) return;

    // Prevent uploading if the path is already a cloud path (workaround for component bug)
    if (tempFilePath.startsWith('cloud://')) {
      console.error('Upload blocked: filePath is already a cloud path.', tempFilePath);
      wx.showToast({
        title: '无效的头像文件',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '上传头像中...',
      mask: true
    });

    const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.jpg`; // Use a unique name
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: res => {
        console.log('[上传文件] 成功：', res);
        const fileID = res.fileID;
        this.setData({
          avatarFileID: fileID, // Set the new cloud fileID
        });
        wx.hideLoading();
        wx.showToast({
          title: '头像上传成功',
          icon: 'success',
          duration: 1000
        });
      },
      fail: e => {
        console.error('[上传文件] 失败：', e);
        wx.hideLoading();
        wx.showToast({
          title: '头像上传失败',
          icon: 'none'
        });
        this.setData({
          avatarFileID: '', // Clear fileID on failure
        });
      }
    });
  },

  onSaveProfile() {
    // Prevent duplicate submissions
    if (this.data.isSaving) {
      return;
    }

    if (!this.data.openidReady) {
      wx.showToast({
        title: '正在获取用户信息...',
        icon: 'none'
      });
      return;
    }

    // Check if the avatar has been uploaded and we have a fileID
    if (!this.data.avatarFileID || !this.data.avatarFileID.startsWith('cloud://')) {
      wx.showToast({
        title: '请等待头像上传完成',
        icon: 'none'
      });
      return;
    }

    if (!this.data.nickName) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSaving: true });
    wx.showLoading({
      title: '正在保存...',
    });

    // Call the cloud function to update user info
    wx.cloud.callFunction({
      name: 'updateUser',
      data: {
        nickName: this.data.nickName,
        avatarUrl: this.data.avatarFileID // Pass the uploaded fileID
      },
      success: res => {
        if (res.result && res.result.success) {
          wx.showToast({
            title: '保存成功',
          });
          // Update globalData
          const userInfo = {
            nickName: this.data.nickName,
            avatarUrl: this.data.avatarFileID,
            _openid: app.globalData.openid
          };
          app.globalData.userInfo = userInfo;
          // Save userInfo to local storage
          wx.setStorageSync('userInfo', userInfo);
          // Redirect to the home page
          wx.switchTab({
            url: '/pages/index/index',
          });
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        wx.showToast({
          title: '调用失败',
          icon: 'none'
        });
        console.error('[云函数] [updateUser] 调用失败', err);
      },
      complete: () => {
        wx.hideLoading(); // Always hide loading
        this.setData({ isSaving: false }); // Always reset the saving flag
      }
    });
  }
});