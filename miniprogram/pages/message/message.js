const api = require('../../utils/request');
const track = require('../../utils/track');

Page({
  data: {
    filter: 'all', // all | unread
    list: [],
    loading: true
  },

  onShow() {
    this.loadList();
  },

  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    track.track('message_filter', { filter });
    this.setData({ filter }, () => this.loadList());
  },

  async loadList() {
    this.setData({ loading: true });
    const { list } = await api.get('/message/list', { filter: this.data.filter });
    this.setData({ list, loading: false });
  },

  onTapItem(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    track.track('message_click', { message_id: item.id, type: item.type });
    // 标记已读
    const list = this.data.list.map((m) => (m.id === item.id ? { ...m, read: true } : m));
    this.setData({ list });
    // 按消息类型跳转对应页面
    const routes = {
      score: '/pages/score/score',
      report: '/pages/report/report',
      notice: ''
    };
    const url = routes[item.type];
    if (url) wx.navigateTo({ url });
  }
});
