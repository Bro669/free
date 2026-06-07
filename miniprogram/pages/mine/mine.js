const track = require('../../utils/track');
const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    groups: [
      [
        { key: 'school', icon: 'm_school', name: '校园简介', url: '/pages/school/school' },
        { key: 'advisor', icon: 'm_advisor', name: '添加生涯顾问', url: '/pages/advisor/advisor' }
      ],
      [
        { key: 'about', icon: 'm_about', name: '关于我们', url: '/pages/about/about' },
        { key: 'feedback', icon: 'm_feedback', name: '意见反馈', url: '/pages/feedback/feedback' },
        { key: 'settings', icon: 'm_settings', name: '账户设置', url: '/pages/settings/settings' }
      ]
    ]
  },

  onShow() {
    const app = getApp();
    this.setData({ isLogin: app.globalData.isLogin, userInfo: app.globalData.userInfo });
  },

  goLogin() {
    gotoLogin();
  },

  goProfile() {
    if (!this.data.isLogin) return gotoLogin();
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onMenuTap(e) {
    const { url, key } = e.currentTarget.dataset;
    track.track('mine_menu_click', { key });
    const needLogin = ['advisor', 'feedback'].includes(key);
    if (needLogin && !this.data.isLogin) return gotoLogin();
    wx.navigateTo({ url });
  }
});
