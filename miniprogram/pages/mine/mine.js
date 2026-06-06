const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    menus: [
      { key: 'archive', icon: '🌱', name: '成长档案', tab: true, url: '/pages/archive/archive' },
      { key: 'advisor', icon: '🧭', name: '添加生涯顾问', url: '/pages/advisor/advisor' },
      { key: 'about', icon: 'ℹ️', name: '关于我们', url: '/pages/about/about' },
      { key: 'feedback', icon: '💬', name: '意见反馈', url: '/pages/feedback/feedback' },
      { key: 'settings', icon: '⚙️', name: '账户设置', url: '/pages/settings/settings' }
    ]
  },

  onShow() {
    const app = getApp();
    this.setData({
      isLogin: app.globalData.isLogin,
      userInfo: app.globalData.userInfo
    });
  },

  goLogin() {
    gotoLogin();
  },

  goProfile() {
    if (!this.data.isLogin) return gotoLogin();
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onMenuTap(e) {
    const item = this.data.menus[e.currentTarget.dataset.index];
    // 关于我们、账户设置等无需登录也可查看；其余需登录
    const needLogin = ['archive', 'advisor', 'feedback'].includes(item.key);
    if (needLogin && !this.data.isLogin) return gotoLogin();
    if (item.tab) wx.switchTab({ url: item.url });
    else wx.navigateTo({ url: item.url });
  }
});
