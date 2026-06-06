const api = require('../../utils/request');
const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    currentChild: null,
    childList: [],
    showChildPicker: false,
    quickEntries: [],
    messages: []
  },

  onShow() {
    const app = getApp();
    this.setData({
      isLogin: app.globalData.isLogin,
      userInfo: app.globalData.userInfo
    });
    this.loadData();
  },

  async loadData() {
    const home = await api.get('/home/index');
    this.setData({ quickEntries: home.quickEntries });

    if (this.data.isLogin) {
      const [{ list }, msg] = await Promise.all([
        api.get('/child/list'),
        api.get('/message/list', { filter: 'all' })
      ]);
      const app = getApp();
      let current = app.globalData.currentChild || list[0];
      app.globalData.childList = list;
      app.globalData.currentChild = current;
      this.setData({
        childList: list,
        currentChild: current,
        messages: msg.list.slice(0, 3)
      });
    } else {
      this.setData({ childList: [], currentChild: null, messages: [] });
    }
  },

  toggleChildPicker() {
    if (this.data.childList.length <= 1) return;
    this.setData({ showChildPicker: !this.data.showChildPicker });
  },

  selectChild(e) {
    const child = this.data.childList[e.currentTarget.dataset.index];
    getApp().globalData.currentChild = child;
    this.setData({ currentChild: child, showChildPicker: false });
  },

  goLogin() {
    gotoLogin();
  },

  onQuickTap(e) {
    const item = this.data.quickEntries[e.currentTarget.dataset.index];
    if (!this.requireLogin()) return;
    // tab 页用 switchTab，其余用 navigateTo
    if (item.url === '/pages/archive/archive') {
      wx.switchTab({ url: item.url });
    } else {
      wx.navigateTo({ url: item.url });
    }
  },

  goMessage() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: '/pages/message/message' });
  },

  requireLogin() {
    if (!this.data.isLogin) {
      gotoLogin();
      return false;
    }
    return true;
  }
});
