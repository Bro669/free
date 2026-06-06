const api = require('../../utils/request');

Page({
  data: { info: null },

  async onLoad() {
    const info = await api.get('/teacher/info');
    this.setData({ info });
  }
});
