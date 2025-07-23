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
  },

  onLoad: function () {},

  onShow: function () {
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
    const { postindex, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;

    if (originalWidth === 0 || originalHeight === 0) return;
    const actualRatio = originalWidth / originalHeight;

    // --- 多图 Swiper 逻辑 ---
    if (type === 'multi' && imgindex === 0) {
      const selector = `#image-container-${postindex}`;
      wx.createSelectorQuery().in(this)
        .select(selector)
        .boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const maxRatio = 16 / 9;
            const minRatio = 9 / 16;
            let targetRatio = actualRatio;
            if (actualRatio > maxRatio) targetRatio = maxRatio;
            else if (actualRatio < minRatio) targetRatio = minRatio;
            
            this.setData({
              [`swiperHeights[${postindex}]`]: containerWidth / targetRatio,
            });
          }
        }).exec();
    }

    // --- 单图 Image 逻辑 ---
    if (type === 'single') {
      const selector = `#image-container-${postindex}`;
      const minRatio = 9 / 16;

      if (actualRatio < minRatio) {
        // 图片过长，才进行干预
        wx.createSelectorQuery().in(this)
          .select(selector)
          .boundingClientRect(rect => {
            if (rect && rect.width) {
              this.setData({
                [`swiperHeights[${postindex}]`]: rect.width / minRatio,
              });
            }
          }).exec();
      } else {
        // 比例正常，确保没有旧的高度值干扰 widthFix
        if (this.data.swiperHeights[postindex] !== undefined) {
          this.setData({
            [`swiperHeights[${postindex}]`]: undefined,
          });
        }
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