// pages/post-detail/post-detail.js
const app = getApp();

Page({
  data: {
    post: null,
    comments: [],
    newComment: '',
    commentCount: 0,
    isLoading: true,
    isSubmitDisabled: true,
    replyToComment: null,
    replyToAuthor: '',
    showUploadTip: false,
    votingInProgress: false,
    // --- 已修正和新增的 data ---
    imageContainerHeight: null, // 用于控制swiper的高度
    swiperHeights: {}, // 多图swiper高度
    imageClampHeights: {}, // 单图瘦高图钳制高度
  },

  onLoad: function (options) {
    const postId = options.id;
    if (postId) {
      this.loadPostDetail(postId);
    } else {
      this.setData({ isLoading: false });
      wx.showToast({ title: '无效的帖子ID', icon: 'none' });
    }
  },

  loadPostDetail: function(postId) {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getPostDetail',
      data: { postId: postId },
      success: res => {
        if (res.result && res.result.post) {
          let post = res.result.post;
          post.formattedCreateTime = this.formatTime(post.createTime);
          this.setData({
            post: post,
            commentCount: res.result.commentCount || 0,
          });
          this.getComments(post._id);
        } else {
          wx.showToast({ title: '帖子加载失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to get post detail', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        wx.hideLoading();
      }
    });
  },

  getComments: function(postId) {
    wx.cloud.callFunction({
      name: 'getComments',
      data: { postId: postId },
      success: res => {
        if (res.result && res.result.comments) {
          const comments = res.result.comments.map(comment => {
            comment.formattedCreateTime = this.formatTime(comment.createTime);
            if (comment.replies) {
              comment.replies.forEach(reply => {
                reply.formattedCreateTime = this.formatTime(reply.createTime);
              });
            }
            return comment;
          });
          this.setData({ comments: comments });
        } else {
          wx.showToast({ title: '评论加载失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to get comments', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  onVote: function(event) {
    const postId = event.currentTarget.dataset.postid;
    if (this.data.votingInProgress) return;
    this.setData({ votingInProgress: true });
    
    const post = this.data.post;
    const originalVotes = post.votes;
    const originalIsVoted = post.isVoted;
    
    post.votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    post.isVoted = !originalIsVoted;
    this.setData({ post: post });
    
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          post.votes = originalVotes;
          post.isVoted = originalIsVoted;
          this.setData({ post: post });
        } else if (post.votes !== res.result.votes) {
          post.votes = res.result.votes;
          this.setData({ post: post });
        }
      },
      fail: () => {
        post.votes = originalVotes;
        post.isVoted = originalIsVoted;
        this.setData({ post: post });
        wx.showToast({ title: '操作失败，请检查网络', icon: 'none' });
      },
      complete: () => {
        this.setData({ votingInProgress: false });
      }
    });
  },

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

  // --- Swiper 和图片高度计算 ---
  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;
  
    // 多图
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

  

  onImageError: function(e) {
    console.error('图片加载失败', e);
  },

  onAvatarError: function(e) {
    console.error('头像加载失败', e);
  },

  // --- 评论功能 (已恢复) ---
  onCommentInput: function(e) {
    this.setData({
      newComment: e.detail.value,
      isSubmitDisabled: e.detail.value.trim() === ''
    });
  },

  onSubmitComment: function() {
    if (this.data.isSubmitDisabled) return;

    const content = this.data.newComment;
    const postId = this.data.post._id;
    const replyTo = this.data.replyToComment;

    wx.showLoading({ title: '提交中...' });
    wx.cloud.callFunction({
      name: 'addComment',
      data: { 
        postId: postId,
        content: content,
        replyTo: replyTo
      },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '评论成功' });
          this.setData({ 
            newComment: '',
            isSubmitDisabled: true,
            replyToComment: null,
            replyToAuthor: ''
          });
          this.getComments(postId);
        } else {
          wx.showToast({ title: res.result.message || '评论失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('Failed to add comment', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  showReplyInput: function(e) {
    const commentId = e.currentTarget.dataset.commentId;
    const authorName = e.currentTarget.dataset.authorName;
    this.setData({
      replyToComment: commentId,
      replyToAuthor: authorName
    });
  },

  cancelReply: function() {
    this.setData({
      replyToComment: null,
      replyToAuthor: ''
    });
  },

  toggleLikeComment: function(e) {
    const commentId = e.currentTarget.dataset.commentId;
    const liked = e.currentTarget.dataset.liked;

    wx.cloud.callFunction({
      name: 'likeComment',
      data: { commentId: commentId },
      success: res => {
        if (res.result.success) {
          this.updateCommentLikeStatus(commentId, !liked, res.result.likes);
        } else {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to like comment', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  updateCommentLikeStatus: function(commentId, liked, likes) {
    let comments = this.data.comments;
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]._id === commentId) {
        comments[i].liked = liked;
        comments[i].likes = likes;
        break;
      }
      if (comments[i].replies) {
        for (let j = 0; j < comments[i].replies.length; j++) {
          if (comments[i].replies[j]._id === commentId) {
            comments[i].replies[j].liked = liked;
            comments[i].replies[j].likes = likes;
            break;
          }
        }
      }
    }
    this.setData({ comments: comments });
  },

  toggleShowAllReplies: function(e) {
    const commentId = e.currentTarget.dataset.commentId;
    let comments = this.data.comments;
    const comment = comments.find(c => c._id === commentId);
    if (comment) {
      comment.showAllReplies = !comment.showAllReplies;
      this.setData({ comments: comments });
    }
  },

  // --- 时间格式化 (已恢复) ---
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
  }
});