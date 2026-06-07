const api = require('../../utils/request');
const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    detail: null,
    activeChapter: 'cover'
  },

  onShow() {
    const app = getApp();
    this.setData({ isLogin: app.globalData.isLogin });
    if (app.globalData.isLogin && !this.data.detail) this.loadData();
  },

  async loadData() {
    const detail = await api.get('/archive/detail');
    this.setData({ detail });
  },

  switchChapter(e) {
    this.setData({ activeChapter: e.currentTarget.dataset.key });
  },

  openInterpret() {
    wx.showToast({ title: '成长档案解读（待接入）', icon: 'none' });
  },

  goLogin() {
    gotoLogin();
  }
});
