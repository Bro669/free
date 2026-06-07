// app.js
App({
  globalData: {
    // 登录态与用户信息（占位，真实环境由后端返回）
    isLogin: false,
    token: '',
    userInfo: null,
    // 当前选中的孩子（支持多孩切换）
    currentChild: null,
    childList: []
  },

  onLaunch() {
    // 读取本地缓存的登录态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.isLogin = true;
      this.globalData.token = token;
      this.globalData.userInfo = userInfo || null;
    }
  },

  // 统一设置登录态
  setLogin(token, userInfo) {
    this.globalData.isLogin = true;
    this.globalData.token = token;
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('token', token);
    wx.setStorageSync('userInfo', userInfo);
  },

  // 退出登录
  logout() {
    this.globalData.isLogin = false;
    this.globalData.token = '';
    this.globalData.userInfo = null;
    this.globalData.currentChild = null;
    this.globalData.childList = [];
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
  }
});
