const api = require('../../utils/request');
const chart = require('../../utils/chart');

Page({
  data: {
    data: null,
    termIndex: 0,
    chartView: 'bar' // bar | line
  },

  _canvas: null, // 缓存 ctx/宽高

  async onLoad() {
    const data = await api.get('/score/list');
    // 为各科附加图例颜色（与折线一致）
    data.subjects = data.subjects.map((s, i) => ({
      ...s,
      color: chart.COLORS[i % chart.COLORS.length]
    }));
    this.setData({ data }, () => this.initChart());
  },

  async initChart() {
    try {
      this._canvas = await chart.initCanvas('#scoreChart', this);
      this.renderChart();
    } catch (e) {
      // 节点未就绪时重试一次
      setTimeout(() => this.initChart(), 100);
    }
  },

  renderChart() {
    if (!this._canvas || !this.data.data) return;
    const { ctx, width, height } = this._canvas;
    const subjects = this.data.data.subjects;
    if (this.data.chartView === 'bar') {
      chart.drawBar(ctx, width, height, {
        labels: subjects.map((s) => s.name),
        values: subjects.map((s) => s.score)
      });
    } else {
      chart.drawLine(ctx, width, height, {
        xLabels: ['1次', '2次', '3次', '4次'],
        series: subjects.map((s, i) => ({
          name: s.name,
          data: s.trend,
          color: chart.COLORS[i % chart.COLORS.length]
        }))
      });
    }
  },

  onTermChange(e) {
    this.setData({ termIndex: e.detail.value });
    // TODO: 切换学期后按 term 重新拉取成绩并 renderChart()
  },

  switchChart(e) {
    this.setData({ chartView: e.currentTarget.dataset.view }, () => this.renderChart());
  }
});
