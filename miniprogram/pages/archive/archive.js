const api = require('../../utils/request');
const track = require('../../utils/track');
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
    const key = e.currentTarget.dataset.key;
    track.track('archive_chapter_switch', { chapter: key });
    this.setData({ activeChapter: key });
  },

  openInterpret() {
    wx.showToast({ title: '成长档案解读（待接入）', icon: 'none' });
  },

  goLogin() {
    gotoLogin();
  }
});
