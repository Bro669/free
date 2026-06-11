// 路线广场：浏览大家公开的字形路线
const fmt = require('../../utils/format')

const PAGE_SIZE = 20

Page({
  data: {
    routes: [],
    loading: false,
    finished: false,
    loadError: false
  },

  onShow() {
    this.reload()
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.finished) this.loadMore()
  },

  reload() {
    this.setData({ routes: [], finished: false, loadError: false })
    return this.loadMore()
  },

  async loadMore() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      // field 投影：列表不拉 polyline/anchors 等大数组，省流量提速
      const res = await db.collection('routes')
        .where({ isPublic: true })
        .field({ name: true, text: true, distance: true, createdAt: true, thumb: true, fidelity: true })
        .orderBy('createdAt', 'desc')
        .skip(this.data.routes.length)
        .limit(PAGE_SIZE)
        .get()
      const items = res.data.map(r => ({
        _id: r._id,
        name: r.name,
        text: r.text,
        thumb: r.thumb || '',
        fidelity: r.fidelity || 0,
        distanceText: fmt.formatDistance(r.distance),
        dateText: fmt.formatDate(r.createdAt)
      }))
      this.setData({
        routes: this.data.routes.concat(items),
        finished: items.length < PAGE_SIZE,
        loading: false
      })
    } catch (err) {
      console.error('加载广场失败', err)
      this.setData({ loading: false, loadError: true, finished: true })
    }
  },

  openRoute(e) {
    wx.navigateTo({ url: '/pages/routeDetail/routeDetail?id=' + e.currentTarget.dataset.id })
  },

  goDesign() {
    wx.switchTab({ url: '/pages/design/design' })
  },

  onShareAppMessage() {
    return { title: '骑字——在城市里骑出你的名字' }
  },

  onShareTimeline() {
    return { title: '骑字——在城市里骑出你的名字' }
  }
})
