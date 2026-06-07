const api = require('../../utils/request');
const { gotoLogin } = require('../../utils/util');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    notice: '',
    quickEntries: [],
    archiveProgress: 0,
    student: null,
    classroomTab: 'all',
    classroomTabs: [
      { key: 'all', name: '全部' },
      { key: 'career', name: '生涯实践' },
      { key: 'activity', name: '活动纪实' }
    ],
    articles: []
  },

  onShow() {
    const app = getApp();
    this.setData({ isLogin: app.globalData.isLogin, userInfo: app.globalData.userInfo });
    this.loadData();
  },

  async loadData() {
    const home = await api.get('/home/index');
    this.setData({
      notice: home.notice,
      quickEntries: home.quickEntries,
      archiveProgress: home.archiveProgress,
      student: this.data.isLogin ? home.student : null
    });
    this.loadArticles();
  },

  async loadArticles() {
    const { list } = await api.get('/classroom/list', { category: this.data.classroomTab });
    this.setData({ articles: list });
  },

  switchClassroomTab(e) {
    this.setData({ classroomTab: e.currentTarget.dataset.key }, () => this.loadArticles());
  },

  goLogin() {
    gotoLogin();
  },

  requireLogin() {
    if (!this.data.isLogin) {
      gotoLogin();
      return false;
    }
    return true;
  },

  onQuickTap(e) {
    if (!this.requireLogin()) return;
    const item = this.data.quickEntries[e.currentTarget.dataset.index];
    wx.navigateTo({ url: item.url });
  },

  goArchive() {
    if (!this.requireLogin()) return;
    wx.switchTab({ url: '/pages/archive/archive' });
  },

  goClassroomDetail(e) {
    const item = this.data.articles[e.currentTarget.dataset.index];
    wx.navigateTo({ url: '/pages/classroom/detail?id=' + item.id });
  },

  goClassroomMore() {
    wx.navigateTo({ url: '/pages/classroom/classroom' });
  }
});
