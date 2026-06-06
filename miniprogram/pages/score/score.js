const api = require('../../utils/request');

Page({
  data: {
    data: null,
    termIndex: 0,
    chartView: 'bar', // bar | line
    bars: []
  },

  async onLoad() {
    const data = await api.get('/score/list');
    this.buildBars(data);
    this.setData({ data });
  },

  // 计算柱状高度百分比
  buildBars(data) {
    const max = Math.max(...data.subjects.map((s) => (s.score / s.full) * 100));
    const bars = data.subjects.map((s) => {
      const pct = (s.score / s.full) * 100;
      return { ...s, pct, height: (pct / max) * 100 };
    });
    this.setData({ bars });
  },

  onTermChange(e) {
    this.setData({ termIndex: e.detail.value });
    // TODO: 切换学期后按 term 重新拉取成绩
  },

  switchChart(e) {
    this.setData({ chartView: e.currentTarget.dataset.view });
  }
});
