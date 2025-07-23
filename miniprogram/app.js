// app.js
App({
  onLaunch: function () {
    // Clear a problematic cache if it exists (good practice)
    wx.removeStorageSync('cachedPostList');

    this.globalData = {
      userInfo: null,
      openid: null,
      env: "", // An empty string means the default environment
    };

    // Initialize cloud capabilities
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // --- Refactored Login Logic ---

    // 1. Try to log in from local storage first
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo._openid) {
      console.log("从缓存中找到用户信息，执行自动登录", userInfo);
      this.globalData.userInfo = userInfo;
      this.globalData.openid = userInfo._openid;
      // If login is successful from cache, go to the main page
      wx.switchTab({ url: '/pages/index/index' });
    } else {
      // 2. If no cache, perform the full login flow
      console.log("缓存未命中，执行云端登录流程");
      this.loginAndCheckUser();
    }
  },

  loginAndCheckUser: function() {
    wx.cloud.callFunction({
      name: 'login', // This cloud function should return the user's openid
      success: res => {
        const openid = res.result.openid;
        console.log('[云函数] [login] user openid: ', openid);
        this.globalData.openid = openid;
        // Store openid immediately in case user needs to register
        wx.setStorageSync('userOpenId', openid); 

        const db = wx.cloud.database();
        db.collection('users').where({ _openid: openid }).get({
          success: userRes => {
            if (userRes.data.length > 0) {
              // User is registered in the database, login successful
              const userInfo = userRes.data[0];
              this.globalData.userInfo = userInfo;
              wx.setStorageSync('userInfo', userInfo); // Update local storage
              console.log('[数据库] [查询记录] 成功: ', userInfo);
              
              // Navigate to the main page after successful login
              wx.switchTab({ url: '/pages/index/index' });
            } else {
              // User is not registered, redirect to the login page
              console.log('[数据库] [查询记录] 失败: 用户未注册');
              wx.redirectTo({ url: '/pages/login/login' });
            }
          },
          fail: err => {
            wx.showToast({ icon: 'none', title: '数据库查询失败' });
            console.error('[数据库] [查询记录] 失败：', err);
          }
        });
      },
      fail: err => {
        console.error('[云函数] [login] 调用失败', err);
        wx.showToast({ icon: 'none', title: '登录失败，请检查网络' });
      }
    });
  },

  globalData: {
    userInfo: null,
    openid: null,
    env: "", // an empty string means the default environment
  },
});
