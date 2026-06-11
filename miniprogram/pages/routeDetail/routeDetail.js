// 路线详情：预览完整路线，入口：开始骑行 / 复制去修改 / 导出 GPX / 删除 / 公开开关
const fmt = require('../../utils/format')
const gpx = require('../../utils/gpx')

const app = getApp()

Page({
  data: {
    route: null,
    polylines: [],
    includePoints: [],
    distanceText: '',
    dateText: '',
    isMine: false,
    loading: true
  },

  onLoad(options) {
    this.routeId = options.id
    this.load()
  },

  async load() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('routes').doc(this.routeId).get()
      const route = res.data
      const openid = app.globalData.openid || await app.login()
      const polylines = []
      const includePoints = []
      route.polyline.forEach(line => {
        const points = line.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
        includePoints.push(...points)
        polylines.push({ points, color: '#19C37D', width: 6 })
      })
      ;(route.connectors || []).forEach(line => {
        polylines.push({
          points: line.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
          color: '#9AA39E',
          width: 3,
          dottedLine: true
        })
      })
      // 起点标记：第一笔的第一个点（骑行从这里出发）
      const start = route.polyline[0] && route.polyline[0][0]
      const markers = start ? [{
        id: 1,
        latitude: start[0],
        longitude: start[1],
        width: 24,
        height: 32,
        callout: { content: '起点', display: 'ALWAYS', borderRadius: 6, padding: 4, fontSize: 12 }
      }] : []
      this.setData({
        route,
        polylines,
        markers,
        includePoints,
        distanceText: fmt.formatDistance(route.distance),
        dateText: fmt.formatDate(route.createdAt),
        isMine: route._openid === openid,
        loading: false
      })
    } catch (err) {
      console.error('加载路线失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '路线不存在或无权查看', icon: 'none' })
    }
  },

  startRide() {
    wx.navigateTo({ url: '/pages/ride/ride?routeId=' + this.routeId })
  },

  copyToDesign() {
    app.globalData.pendingRoute = this.data.route
    wx.switchTab({ url: '/pages/design/design' })
  },

  // 导出 GPX（WGS-84）给码表/骑行 App，按骑行顺序交错笔画与衔接段
  exportGpx() {
    const route = this.data.route
    const toPts = line => line.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
    const lines = []
    const conns = route.connectors || []
    route.polyline.forEach((line, i) => {
      lines.push(toPts(line))
      if (conns[i]) lines.push(toPts(conns[i]))
    })
    const xml = gpx.buildTrackGpx(route.name, lines)
    const path = `${wx.env.USER_DATA_PATH}/route-${this.routeId}.gpx`
    try {
      wx.getFileSystemManager().writeFileSync(path, xml, 'utf8')
      wx.shareFileMessage({
        filePath: path,
        fileName: `${route.name}.gpx`,
        fail: err => {
          if (!/cancel/.test(err.errMsg || '')) {
            wx.showToast({ title: '分享失败', icon: 'none' })
          }
        }
      })
    } catch (err) {
      console.error('导出 GPX 失败', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },

  async togglePublic() {
    const route = this.data.route
    try {
      await wx.cloud.database().collection('routes').doc(this.routeId)
        .update({ data: { isPublic: !route.isPublic } })
      this.setData({ 'route.isPublic': !route.isPublic })
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async remove() {
    const confirm = await wx.showModal({ title: '删除路线', content: '删除后无法恢复，确定吗？' })
    if (!confirm.confirm) return
    try {
      await wx.cloud.database().collection('routes').doc(this.routeId).remove()
      wx.showToast({ title: '已删除' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    const route = this.data.route
    return {
      title: route ? `我设计了一条「${route.text}」骑行路线，约 ${this.data.distanceText}` : '骑字',
      path: '/pages/routeDetail/routeDetail?id=' + this.routeId
    }
  },

  onShareTimeline() {
    const route = this.data.route
    return {
      title: route ? `在城市里骑出「${route.text}」——约 ${this.data.distanceText}` : '骑字',
      query: 'id=' + this.routeId,
      imageUrl: route && route.thumb ? route.thumb : undefined
    }
  }
})
