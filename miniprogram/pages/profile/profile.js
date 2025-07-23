const app = getApp();

const PAGE_SIZE = 5;

Page({
  data: {
    userInfo: {},
    isSidebarOpen: false,
    isLoading: false,
    myPosts: [],
    page: 0,
    hasMore: true,
    PAGE_SIZE: PAGE_SIZE,
    swiperHeights: {}, // 每个帖子的swiper高度，完全跟随第一张图片
    swiperFixedHeight: null, // 仅在onLoad时计算3:4高度
  },

  onLoad: function (options) {
    this.checkLoginAndFetchData();
    // 计算3:4比例高度（宽3高4，竖图）
    const windowWidth = wx.getSystemInfoSync().windowWidth;
    const fixedHeight = Math.round(windowWidth * 4 / 3);
    this.setData({ swiperFixedHeight: fixedHeight });
  },

  onShow: function () {
    if (this.data.myPosts.length === 0) {
      this.loadMyPosts();
    }
  },

  onPullDownRefresh: function () {
    console.log('【profile】下拉刷新触发，重置分页');
    this.setData({
      myPosts: [],
      page: 0,
      hasMore: true
    });
    this.loadMyPosts(() => {
      wx.stopPullDownRefresh();
      console.log('【profile】下拉刷新结束');
    });
  },

  onReachBottom: function () {
    console.log('【profile】触底加载触发', 'hasMore:', this.data.hasMore, 'isLoading:', this.data.isLoading, '当前页:', this.data.page);
    if (!this.data.hasMore || this.data.isLoading) return;
    this.loadMyPosts();
  },

  // 强制刷新数据
  forceRefresh: function() {
    console.log('强制刷新数据');
    // 清除缓存
    this.setData({
      userInfo: {},
      myPosts: [],
      isLoading: true
    });
    // 重新获取数据
    this.checkLoginAndFetchData();
  },

  checkLoginAndFetchData: function() {
    const storedUserInfo = wx.getStorageSync('userInfo');
    console.log('存储的用户信息:', storedUserInfo);
    
    if (storedUserInfo && storedUserInfo._openid) {
      console.log('用户已登录，开始获取个人资料');
      this.fetchUserProfile();
    } else {
      console.log('用户未登录，存储的用户信息:', storedUserInfo);
      this.setData({ isLoading: false });
      wx.showToast({ title: '请先登录', icon: 'none' });
      // Optionally, redirect to a login page
      // wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  fetchUserProfile: function() {
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      success: res => {
        console.log('getMyProfileData 返回：', res);
        if (res.result && res.result.success && res.result.userInfo) {
          const user = res.result.userInfo;
          if (user.birthday) {
            user.age = this.calculateAge(user.birthday);
          } else {
            user.age = '';
          }
          // 只更新 userInfo，不更新 myPosts
          this.setData({ userInfo: user });
        } else {
          wx.showToast({ title: '个人资料数据异常', icon: 'none', duration: 3000 });
          console.error('个人资料数据异常', res);
          const storedUserInfo = wx.getStorageSync('userInfo');
          if(storedUserInfo) {
            if (storedUserInfo.birthday) {
              storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
            }
            this.setData({ userInfo: storedUserInfo });
          }
        }
      },
      fail: err => {
        wx.showToast({ title: 'getMyProfileData 云函数失败', icon: 'none', duration: 3000 });
        console.error('getMyProfileData 云函数失败', err);
        const storedUserInfo = wx.getStorageSync('userInfo');
        if(storedUserInfo) {
          if (storedUserInfo.birthday) {
            storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
          }
          this.setData({ userInfo: storedUserInfo });
        }
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  loadMyPosts: function (cb) {
    if (this.data.isLoading) return;
    const { page, PAGE_SIZE } = this.data;
    console.log('【profile】请求分页参数', { page, PAGE_SIZE, skip: page * PAGE_SIZE, limit: PAGE_SIZE });
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('【profile】本次返回帖子数量:', posts.length);
          posts.forEach(post => {
            if (post.createTime) {
              post.formattedCreateTime = this.formatTime(post.createTime);
            }
          });
          const newMyPosts = page === 0 ? posts : this.data.myPosts.concat(posts);
          console.log('【profile】更新后 myPosts 长度:', newMyPosts.length, 'hasMore:', posts.length === PAGE_SIZE, 'page:', page + 1);
          this.setData({
            myPosts: newMyPosts,
            page: page + 1,
            hasMore: posts.length === PAGE_SIZE
          });
        }
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 根据生日计算年龄
  calculateAge: function(birthday) {
    if (!birthday) return '';
    try {
      const birth = new Date(birthday);
      if (isNaN(birth.getTime())) return '';
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
      return age > 0 ? age : '';
    } catch (e) {
      console.error('计算年龄失败:', e);
      return '';
    }
  },

  // 格式化时间
  formatTime: function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  },

  // 点击帖子跳转详情
  navigateToPostDetail: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  // 删除帖子
  onDelete: function(event) {
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    const that = this;

    wx.showModal({
      title: '确认删除',
      content: '您确定要删除这条帖子吗？此操作不可恢复。',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deletePost',
            data: { postId: postId },
            success: function(res) {
              wx.hideLoading();
              if (res.result && res.result.success) {
                wx.showToast({ title: '删除成功' });
                const newList = that.data.myPosts.filter(post => post._id !== postId);
                that.setData({ myPosts: newList });
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: function(err) {
              wx.hideLoading();
              wx.showToast({ title: '调用失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 图片预览
  handlePreview: function(event) {
    const currentUrl = event.currentTarget.dataset.src;
    const originalUrls = event.currentTarget.dataset.originalImageUrls;
    if (currentUrl) {
      wx.previewImage({
        current: currentUrl,
        urls: originalUrls || [currentUrl]
      });
    }
  },

  // 阻止事件冒泡
  stopPropagation: function() {
    // 空函数，用于阻止事件冒泡
  },

  // 头像加载错误处理
  onAvatarError: function(e) {
    console.error('头像加载失败:', e);
    // 可以在这里设置默认头像
  },

  // 图片加载错误处理
  onImageError: function(e) {
    console.error('图片加载失败:', e);
    const { src } = e.detail;
    console.error('失败的图片URL:', src);
    
    // 获取当前图片的上下文信息
    const { postindex, imgindex } = e.currentTarget.dataset;
    if (postindex !== undefined && imgindex !== undefined) {
      const post = this.data.myPosts[postindex];
      console.error('图片加载失败的上下文:', {
        postId: post ? post._id : 'unknown',
        postTitle: post ? post.title : 'unknown',
        imageIndex: imgindex,
        imageUrl: src
      });
    }
    
    // 不显示toast，避免频繁弹窗，但记录错误
    console.error('图片加载失败详情:', {
      error: e.detail,
      src: src,
      dataset: e.currentTarget.dataset
    });
  },

  onImageLoad: function(e) {
    const { postindex, imgindex, type } = e.currentTarget.dataset;
    const { width, height } = e.detail;
    if (type === 'single' && width > 0 && height > 0) {
      // 单图：只对特别瘦高的图片做9:16钳制，其它auto
      const minRatio = 9 / 16;
      const actualRatio = width / height;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery();
        query.select(`#profile-single-img-${postindex}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const displayHeight = rect.width / minRatio;
            this.setData({
              [`swiperHeights[${postindex}]`]: displayHeight
            });
          }
        }).exec();
      } else {
        this.setData({
          [`swiperHeights[${postindex}]`]: null
        });
      }
    }
    if (type === 'multi' && imgindex === 0 && width > 0 && height > 0) {
      // 多图首图：9:16~16:9钳制
      const query = wx.createSelectorQuery();
      query.select(`#profile-swiper-img-${postindex}-0`).boundingClientRect(rect => {
        if (rect && rect.width) {
          const maxRatio = 16 / 9;
          const minRatio = 9 / 16;
          const actualRatio = width / height;
          let targetRatio = actualRatio;
          if (actualRatio > maxRatio) {
            targetRatio = maxRatio;
          } else if (actualRatio < minRatio) {
            targetRatio = minRatio;
          }
          const displayHeight = rect.width / targetRatio;
      this.setData({
        [`swiperHeights[${postindex}]`]: displayHeight
      });
        }
      }).exec();
    }
  },

  // 测试图片URL有效性
  testImageUrls: function() {
    console.log('=== 开始测试图片URL有效性 ===');
    this.data.myPosts.forEach((post, index) => {
      console.log(`帖子${index + 1} (${post._id}):`);
      console.log('  - 标题:', post.title);
      console.log('  - 作者头像:', post.authorAvatar);
      console.log('  - 图片URLs:', post.imageUrls);
      console.log('  - 原图URLs:', post.originalImageUrls);
      
      if (post.imageUrls && post.imageUrls.length > 0) {
        post.imageUrls.forEach((url, imgIndex) => {
          console.log(`  - 图片${imgIndex + 1}:`, url);
          // 检查URL格式
          if (url && url.startsWith('http')) {
            console.log(`    ✓ 格式正确 (HTTP URL)`);
          } else if (url && url.startsWith('cloud://')) {
            console.log(`    ⚠ 格式为cloud:// (需要转换)`);
          } else if (!url) {
            console.log(`    ✗ URL为空`);
          } else {
            console.log(`    ? 未知格式: ${url}`);
          }
        });
      } else {
        console.log('  - 无图片');
      }
      console.log('---');
    });
    console.log('=== 图片URL测试完成 ===');
  },

  // 切换侧边栏显示/隐藏
  toggleSidebar: function() {
    this.setData({ isSidebarOpen: !this.data.isSidebarOpen });
  },

  // 跳转到我的点赞页面
  navigateToMyLikes: function() {
    wx.navigateTo({
      url: '/pages/my-likes/my-likes',
    });
  },

  // 跳转到编辑资料页面
  navigateToEditProfile: function() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit',
    });
  }
});
