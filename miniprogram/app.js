// app.js
const track = require('./utils/track');

// 全局注入页面 PV / 停留时长（无需逐页埋点）
const originalPage = Page;
Page = function (opts) {
  const userOnShow = opts.onShow;
  const userOnHide = opts.onHide;
  const userOnUnload = opts.onUnload;
  opts.onShow = function () {
    this.__enterTs = Date.now();
    track.trackPageView('/' + this.route);
    if (userOnShow) return userOnShow.apply(this, arguments);
  };
  opts.onHide = function () {
    track.trackPageLeave('/' + this.route, Date.now() - (this.__enterTs || Date.now()));
    if (userOnHide) return userOnHide.apply(this, arguments);
  };
  opts.onUnload = function () {
    track.trackPageLeave('/' + this.route, Date.now() - (this.__enterTs || Date.now()));
    if (userOnUnload) return userOnUnload.apply(this, arguments);
  };
  // 未自定义分享时注入默认分享，统一采集 share 事件并开启转发菜单
  if (!opts.onShareAppMessage) {
    opts.onShareAppMessage = function () {
      track.track('share', { from: 'menu' });
      return { title: '一支橙家长端' };
    };
  }
  return originalPage(opts);
};

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

  onLaunch(options) {
    // 初始化埋点（采集场景值、设备信息，补传失败缓存）
    track.init({ scene: options && options.scene });

    // 读取本地缓存的登录态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.isLogin = true;
      this.globalData.token = token;
      this.globalData.userInfo = userInfo || null;
      track.setCommon({ user_id: userInfo && userInfo.id, role: 'parent' });
    }
    track.track('app_launch', { scene: options && options.scene });
  },

  onHide() {
    track.flush();
  },

  onError(msg) {
    track.track('page_error', { msg: ('' + msg).slice(0, 200) });
  },

  // 统一设置登录态
  setLogin(token, userInfo) {
    this.globalData.isLogin = true;
    this.globalData.token = token;
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('token', token);
    wx.setStorageSync('userInfo', userInfo);
    track.setCommon({ user_id: userInfo && userInfo.id, role: 'parent' });
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
    track.setCommon({ user_id: '', role: '', student_id: '' });
  }
});
