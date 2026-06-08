const api = require('../../utils/request');

Page({
  data: { article: null },

  async onLoad(query) {
    const article = await api.get('/classroom/detail', { id: query.id });
    this.setData({ article });
  }
});
