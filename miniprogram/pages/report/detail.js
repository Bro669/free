const api = require('../../utils/request');

Page({
  data: {
    report: null,
    bars: []
  },

  async onLoad(query) {
    const report = await api.get('/report/detail', { id: query.id });
    const max = Math.max(...report.dimensions.map((d) => d.value));
    const bars = report.dimensions.map((d) => ({ ...d, height: (d.value / max) * 100 }));
    this.setData({ report, bars });
  }
});
