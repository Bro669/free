const api = require('../../utils/request');

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    const { list } = await api.get('/report/list');
    this.setData({ list, loading: false });
  },

  onTapItem(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (item.status === 'generating') {
      wx.showToast({ title: '报告生成中，请稍后查看', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/report/detail?id=' + item.id });
  }
});
