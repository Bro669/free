const api = require('../../utils/request');

Page({
  data: {
    list: [],
    loading: true,
    filters: ['全部测评', '已完成', '生成中'],
    filterIndex: 0
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    const { list } = await api.get('/report/list');
    this.setData({ list, loading: false });
  },

  onFilterChange(e) {
    this.setData({ filterIndex: e.detail.value });
    // TODO: 按筛选条件重新拉取报告列表
  },

  openInterpret() {
    wx.showToast({ title: '测评报告解读（待接入）', icon: 'none' });
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
