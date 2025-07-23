const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const past = new Date(timestamp);
  const diff = now.getTime() - past.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 7) {
    const year = past.getFullYear();
    const month = ('0' + (past.getMonth() + 1)).slice(-2);
    const day = ('0' + past.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  } else if (days >= 1) {
    return `${days}天前`;
  } else if (hours >= 1) {
    return `${hours}小时前`;
  } else if (minutes >= 1) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
};

module.exports = {
  formatTimeAgo
};