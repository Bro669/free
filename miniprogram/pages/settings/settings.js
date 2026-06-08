const track = require('../../utils/track');
const { toast } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    showLogoutConfirm: false
  },

  onShow() {
    this.setData({ isLogin: getApp().globalData.isLogin });
  },

  openAgreement(e) {
    track.track('settings_agreement_click', { type: e.currentTarget.dataset.type });
    wx.navigateTo({ url: '/pages/agreement/agreement?type=' + e.currentTarget.dataset.type });
  },

  confirmLogout() {
    this.setData({ showLogoutConfirm: true });
  },

  cancelLogout() {
    this.setData({ showLogoutConfirm: false });
  },

  doLogout() {
    track.track('logout', {});
    getApp().logout();
    this.setData({ showLogoutConfirm: false, isLogin: false });
    toast('已退出登录', 'success');
    setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600);
  }
});
