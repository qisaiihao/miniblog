// index.js
wx.cloud.init({
  env: 'cloud1-5gj11tm5e1901eaa'
});
const db = wx.cloud.database();
const PAGE_SIZE = 5;

Page({
  data: {
    postList: [],
    votingInProgress: {},
    page: 0,
    hasMore: true,
    isLoading: false,
    swiperHeights: {},
    imageClampHeights: {}, // 新增：单图瘦高图钳制高度
  },

  onLoad: function () {},

  onShow: function () {
    // 只在发帖后自动刷新，其他情况不刷新
    try {
      const shouldRefresh = wx.getStorageSync('shouldRefreshIndex');
      if (shouldRefresh) {
        wx.setStorageSync('shouldRefreshIndex', false);
        this.setData({
          postList: [],
          swiperHeights: {},
          imageClampHeights: {},
          page: 0,
          hasMore: true,
        }, () => {
          this.getPostList();
        });
        return;
      }
    } catch (e) {}
    if (this.data.postList.length === 0) {
      this.getPostList();
    }
  },

  onPullDownRefresh: function () {
    this.setData({
      postList: [],
      swiperHeights: {},
      page: 0,
      hasMore: true,
    }, () => {
      this.getPostList(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.isLoading) return;
    this.getPostList();
  },

  getPostList: function (cb) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    const skip = this.data.page * PAGE_SIZE;

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
          });

          const newPostList = this.data.page === 0 ? posts : this.data.postList.concat(posts);

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '网络错误', icon: 'none' }),
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

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

  // catch:tap 用于图片预览，并阻止跳转
  handlePreview: function(event) {
    const current = event.currentTarget.dataset.src || event.currentTarget.dataset.imageUrl;
    const urls = event.currentTarget.dataset.originalImageUrls;
    if (current && urls && urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  onVote: function(event) {
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    if (this.data.votingInProgress[postId]) return;
    this.setData({ [`votingInProgress.${postId}`]: true });
    let postList = this.data.postList;
    const originalVotes = postList[index].votes;
    const originalIsVoted = postList[index].isVoted;
    postList[index].votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    postList[index].isVoted = !originalIsVoted;
    this.setData({ postList: postList });
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          postList[index].votes = originalVotes;
          postList[index].isVoted = originalIsVoted;
          this.setData({ postList: postList });
        } else if (postList[index].votes !== res.result.votes) {
          postList[index].votes = res.result.votes;
          this.setData({ postList: postList });
        }
      },
      fail: () => {
        postList[index].votes = originalVotes;
        postList[index].isVoted = originalIsVoted;
        this.setData({ postList: postList });
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ [`votingInProgress.${postId}`]: false });
      }
    });
  },

  onImageError: function(e) { console.error('图片加载失败', e.detail); },
  onAvatarError: function(e) { console.error('头像加载失败', e.detail); },
});