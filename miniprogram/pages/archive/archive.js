const api = require('../../utils/request');
const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    archive: null
  },

  onShow() {
    const app = getApp();
    this.setData({ isLogin: app.globalData.isLogin });
    if (app.globalData.isLogin) this.loadData();
  },

  async loadData() {
    const archive = await api.get('/archive/detail');
    this.setData({ archive });
  },

  goLogin() {
    gotoLogin();
  }
});
