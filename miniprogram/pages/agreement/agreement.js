const api = require('../../utils/request');

Page({
  data: { detail: null },

  async onLoad(query) {
    const type = query.type || 'user';
    const detail = await api.get('/agreement/detail', { type });
    wx.setNavigationBarTitle({ title: detail.title });
    this.setData({ detail });
  }
});
