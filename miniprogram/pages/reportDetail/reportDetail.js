const api = require('../../utils/request');
const chart = require('../../utils/chart');
const track = require('../../utils/track');

Page({
  data: {
    report: null
  },

  _canvas: null,

  async onLoad(query) {
    track.track('report_detail_view', { report_id: query.id });
    const report = await api.get('/report/detail', { id: query.id });
    this.setData({ report }, () => this.initChart());
  },

  async initChart() {
    try {
      this._canvas = await chart.initCanvas('#radarChart', this);
      const { ctx, width, height } = this._canvas;
      chart.drawRadar(ctx, width, height, {
        labels: this.data.report.dimensions.map((d) => d.name),
        values: this.data.report.dimensions.map((d) => d.value),
        max: 100
      });
    } catch (e) {
      setTimeout(() => this.initChart(), 100);
    }
  }
});
