// pages/profile-edit/profile-edit.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    birthday: '',
    bio: '',
    endDate: '',
    isSaving: false,
    tempAvatarPath: null
  },

  onLoad: function (options) {
    const userInfo = app.globalData.userInfo || {};
    this.setData({
      avatarUrl: userInfo.avatarUrl || '',
      nickName: userInfo.nickName || '',
      birthday: userInfo.birthday || '',
      bio: userInfo.bio || ''
    });
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl, tempAvatarPath: e.detail.avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value });
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  onSaveChanges: function() {
    if (this.data.isSaving) return;
    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...' });

    let uploadPromise = this.data.tempAvatarPath ? 
      wx.cloud.uploadFile({
        cloudPath: `user_avatars/${Date.now()}`,
        filePath: this.data.tempAvatarPath
      }) : 
      Promise.resolve({ fileID: null });

    uploadPromise.then(uploadRes => {
      return wx.cloud.callFunction({
        name: 'updateUserProfile',
        data: {
          avatarUrl: uploadRes.fileID,
          nickName: this.data.nickName,
          birthday: this.data.birthday,
          bio: this.data.bio
        }
      });
    })
    .then(res => {
      if (res.result.success) {
        wx.hideLoading();
        wx.showToast({ title: '保存成功' });
        
        // 获取页面栈
        const pages = getCurrentPages();
        if (pages.length > 1) {
          // 获取上一个页面实例
          const prePage = pages[pages.length - 2];
          // 调用上一个页面的方法
          prePage.fetchProfileData();
        }

        // 保存成功后，直接返回
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        throw new Error(res.result.message || '云函数保存失败');
      }
    })
    .catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    })
    .finally(() => {
      this.setData({ isSaving: false });
    });
  }
});
