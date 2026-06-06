const api = require('../../utils/request');

Page({
  data: { list: [] },

  async onLoad() {
    const { list } = await api.get('/classroom/list');
    this.setData({ list });
  },

  onTapItem(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    wx.navigateTo({ url: '/pages/classroom/detail?id=' + item.id });
  }
});
