const app = getApp();

const PAGE_SIZE = 5;

Page({
  data: {
    likedPosts: [],
    isLoading: false,
    page: 0,
    hasMore: true,
    PAGE_SIZE: PAGE_SIZE,
    swiperHeights: {}, // 每个帖子的swiper高度，跟随第一张图片
    imageClampHeights: {}, // 新增：单图瘦高图钳制高度
  },

  onLoad: function (options) {
    this.fetchLikedPosts();
  },

  onPullDownRefresh: function () {
    console.log('【my-likes】下拉刷新触发，重置分页');
    this.setData({
      likedPosts: [],
      page: 0,
      hasMore: true
    });
    this.fetchLikedPosts(() => {
      wx.stopPullDownRefresh();
      console.log('【my-likes】下拉刷新结束');
    });
  },

  onReachBottom: function () {
    console.log('【my-likes】触底加载触发', 'hasMore:', this.data.hasMore, 'isLoading:', this.data.isLoading, '当前页:', this.data.page);
    if (!this.data.hasMore || this.data.isLoading) return;
    this.fetchLikedPosts();
  },

  fetchLikedPosts: function(cb) {
    if (this.data.isLoading) return;
    const { page, PAGE_SIZE } = this.data;
    console.log('【my-likes】请求分页参数', { page, PAGE_SIZE, skip: page * PAGE_SIZE, limit: PAGE_SIZE });
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'getMyLikedPosts',
      data: {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('【my-likes】本次返回帖子数量:', posts.length);
          const processPost = (post) => {
            post.formattedCreateTime = this.formatTime(post.createTime);
            if (post.imageUrl && !post.imageUrls) {
              post.imageUrls = [post.imageUrl];
            }
            if (post.originalImageUrl && !post.originalImageUrls) {
              post.originalImageUrls = [post.originalImageUrl];
            }
            if (!post.authorName) {
              post.authorName = '匿名用户';
            }
            if (!post.authorAvatar) {
              post.authorAvatar = '';
            }
            return post;
          };

          const newLikedPosts = page === 0 ? posts.map(processPost) : this.data.likedPosts.concat(posts.map(processPost));
          console.log('【my-likes】更新后 likedPosts 长度:', newLikedPosts.length, 'hasMore:', posts.length === PAGE_SIZE, 'page:', page + 1);
          this.setData({
            likedPosts: newLikedPosts,
            page: page + 1,
            hasMore: posts.length === PAGE_SIZE
          });
        } else {
          wx.showToast({ title: res.result.message || '数据加载失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to fetch liked posts', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  navigateToPost: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  // 预览图片（与首页、我的帖子页统一）
  handlePreview: function(event) {
    const currentUrl = event.currentTarget.dataset.src;
    const originalUrls = event.currentTarget.dataset.originalImageUrls;
    if (currentUrl) {
      wx.previewImage({
        current: currentUrl,
        urls: originalUrls || [currentUrl]
      });
    } else {
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    }
  },

  // 图片加载错误处理（与首页、我的帖子页统一）
  onImageError: function(e) {
    console.error('图片加载失败', e);
    const { src } = e.detail;
    console.error('失败的图片URL:', src);
    // 获取当前图片的上下文信息
    const { postindex, imgindex } = e.currentTarget.dataset;
    if (postindex !== undefined && imgindex !== undefined) {
      const post = this.data.likedPosts[postindex];
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

  // 图片加载成功时，动态设置swiper高度（与首页、我的帖子页统一）
  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;

    // 多图 Swiper 逻辑
    if (type === 'multi' && imgindex === 0) {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#swiper-${postid}`).boundingClientRect(rect => {
        if (rect && rect.width) {
          const containerWidth = rect.width;
          const actualRatio = originalWidth / originalHeight;
          const maxRatio = 16 / 9;
          const minRatio = 9 / 16;
          let targetRatio = actualRatio;
          if (actualRatio > maxRatio) targetRatio = maxRatio;
          else if (actualRatio < minRatio) targetRatio = minRatio;
          const displayHeight = containerWidth / targetRatio;
          if (this.data.swiperHeights[postindex] !== displayHeight) {
            this.setData({ [`swiperHeights[${postindex}]`]: displayHeight });
          }
        }
      }).exec();
    }
    // 单图
    if (type === 'single') {
      const actualRatio = originalWidth / originalHeight;
      const minRatio = 9 / 16;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery().in(this);
        query.select(`#single-image-${postid}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const displayHeight = containerWidth / minRatio;
            if (this.data.imageClampHeights[postid] !== displayHeight) {
              this.setData({ [`imageClampHeights.${postid}`]: displayHeight });
            }
          }
        }).exec();
      }
    }
  },

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

  onAvatarError: function(e) {
    console.error('头像加载失败', e);
    // 可以在这里设置默认头像
  }
});