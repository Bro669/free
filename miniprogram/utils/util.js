// 通用工具函数

// 格式化时间 YYYY-MM-DD HH:mm
function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return (
    date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) +
    ' ' + p(date.getHours()) + ':' + p(date.getMinutes())
  );
}

// 轻提示
function toast(title, icon = 'none') {
  wx.showToast({ title, icon });
}

// 校验手机号
function isPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

// 跳转登录页（保留来源）
function gotoLogin() {
  wx.navigateTo({ url: '/pages/login/login' });
}

module.exports = { formatTime, toast, isPhone, gotoLogin };
