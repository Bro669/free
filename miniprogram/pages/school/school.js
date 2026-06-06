const api = require('../../utils/request');

Page({
  data: {
    school: null,
    activeTab: 0
  },

  async onLoad() {
    const school = await api.get('/school/detail');
    this.setData({ school });
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index });
  }
});
