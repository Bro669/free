const api = require('../../utils/request');
const track = require('../../utils/track');
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
    if (this.data.isLogin && home.student) {
      track.setCommon({ student_id: home.student.studentNo });
    }
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
    const key = e.currentTarget.dataset.key;
    track.track('home_classroom_tab', { category: key });
    this.setData({ classroomTab: key }, () => this.loadArticles());
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
    track.track('home_quick_click', { key: item.key });
    wx.navigateTo({ url: item.url });
  },

  goArchive() {
    if (!this.requireLogin()) return;
    track.track('home_archive_click', {});
    wx.switchTab({ url: '/pages/archive/archive' });
  },

  goNotice() {
    track.track('home_notice_click', {});
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: '/pages/message/message' });
  },

  goClassroomDetail(e) {
    const item = this.data.articles[e.currentTarget.dataset.index];
    track.track('home_article_click', { article_id: item.id });
    wx.navigateTo({ url: '/pages/classroom/detail?id=' + item.id });
  },

  goClassroomMore() {
    track.track('home_more_classroom', {});
    wx.navigateTo({ url: '/pages/classroom/classroom' });
  }
});
