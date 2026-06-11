// 骑行中：目标路线叠加 + GPS 轨迹记录（精度/漂移/抖动三重过滤），暂停分段
const geo = require('../../utils/geo')
const fmt = require('../../utils/format')

const app = getApp()

Page({
  data: {
    // ready | riding | paused
    state: 'ready',
    polylines: [],
    includePoints: [],
    center: { latitude: 39.9087, longitude: 116.3975 },
    distanceText: '0 m',
    durationText: '0:00',
    speedText: '0.0',
    backgroundOk: false
  },

  onLoad(options) {
    this.routeId = options.routeId || ''
    this.route = null
    this.routePolylines = []   // 目标路线底图（灰）
    this.segments = [[]]       // 轨迹分段（暂停后开新段）
    this.lastPoint = null
    this.distance = 0          // 米
    this.movingMs = 0          // 累计运动毫秒
    this.resumedAt = 0
    this.startedAt = 0
    this.timer = null
    if (this.routeId) this.loadRoute()
    wx.getLocation({
      type: 'gcj02',
      success: res => this.setData({ center: { latitude: res.latitude, longitude: res.longitude } })
    })
  },

  onUnload() {
    this.stopLocation()
    if (this.timer) clearInterval(this.timer)
    wx.setKeepScreenOn({ keepScreenOn: false })
  },

  async loadRoute() {
    try {
      const res = await wx.cloud.database().collection('routes').doc(this.routeId).get()
      this.route = res.data
      const polylines = []
      const includePoints = []
      this.route.polyline.forEach(line => {
        const points = line.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
        includePoints.push(...points)
        polylines.push({ points, color: '#B6C2BC', width: 6 })
      })
      ;(this.route.connectors || []).forEach(line => {
        polylines.push({
          points: line.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
          color: '#D5DBD8', width: 3, dottedLine: true
        })
      })
      this.routePolylines = polylines
      this.setData({ polylines, includePoints })
    } catch (err) {
      console.error('加载路线失败', err)
      wx.showToast({ title: '路线加载失败，仍可自由骑行', icon: 'none' })
    }
  },

  // ===== 定位授权与开关 =====
  async start() {
    const ok = await this.ensureLocationAuth()
    if (!ok) return
    wx.startLocationUpdateBackground({
      success: () => this.beginRecording(true),
      fail: () => {
        // 用户只授权了「使用期间」→ 降级前台定位
        wx.startLocationUpdate({
          success: () => {
            wx.showToast({ title: '仅前台记录，请保持屏幕常亮', icon: 'none', duration: 3000 })
            this.beginRecording(false)
          },
          fail: () => wx.showToast({ title: '无法开启定位', icon: 'none' })
        })
      }
    })
  },

  ensureLocationAuth() {
    return new Promise(resolve => {
      wx.getSetting({
        success: res => {
          if (res.authSetting['scope.userLocation']) return resolve(true)
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => resolve(true),
            fail: () => {
              wx.showModal({
                title: '需要定位权限',
                content: '记录骑行轨迹需要访问你的位置，请在设置中开启',
                confirmText: '去设置',
                success: m => {
                  if (!m.confirm) return resolve(false)
                  wx.openSetting({
                    success: s => resolve(!!s.authSetting['scope.userLocation'])
                  })
                }
              })
            }
          })
        }
      })
    })
  },

  beginRecording(backgroundOk) {
    this.startedAt = Date.now()
    this.resumedAt = Date.now()
    this.locationHandler = loc => this.onLocation(loc)
    wx.onLocationChange(this.locationHandler)
    wx.setKeepScreenOn({ keepScreenOn: true })
    this.timer = setInterval(() => this.refreshStats(), 1000)
    this.setData({ state: 'riding', backgroundOk })
  },

  stopLocation() {
    if (this.locationHandler) {
      wx.offLocationChange(this.locationHandler)
      this.locationHandler = null
      wx.stopLocationUpdate()
    }
  },

  // ===== 轨迹处理 =====
  onLocation(loc) {
    if (this.data.state !== 'riding') return
    const point = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      timestamp: Date.now()
    }
    const verdict = geo.classifyTrackPoint(this.lastPoint, point)
    if (verdict === 'inaccurate' || verdict === 'jump') return
    if (verdict === 'still') {
      if (this.lastPoint) this.lastPoint.timestamp = point.timestamp
      return
    }
    if (this.lastPoint) this.distance += geo.haversine(this.lastPoint, point)
    this.lastPoint = point
    this.segments[this.segments.length - 1].push(point)
    this.renderTrack()
  },

  renderTrack() {
    const trackPolylines = this.segments
      .filter(seg => seg.length >= 2)
      .map(seg => ({
        points: seg.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
        color: '#19C37D',
        width: 8
      }))
    this.setData({ polylines: this.routePolylines.concat(trackPolylines) })
  },

  refreshStats() {
    const movingMs = this.movingMs +
      (this.data.state === 'riding' ? Date.now() - this.resumedAt : 0)
    const sec = movingMs / 1000
    this.setData({
      distanceText: fmt.formatDistance(this.distance),
      durationText: fmt.formatDuration(sec),
      speedText: fmt.formatSpeed(sec > 0 ? this.distance / sec : 0)
    })
  },

  pause() {
    this.movingMs += Date.now() - this.resumedAt
    this.lastPoint = null               // 恢复后从新位置开新段，避免暂停位移连线
    this.segments.push([])
    this.setData({ state: 'paused' })
  },

  resume() {
    this.resumedAt = Date.now()
    this.setData({ state: 'riding' })
  },

  async finish() {
    if (this.distance < 50) {
      const m = await wx.showModal({ title: '结束骑行', content: '轨迹太短，结束后将不保存，确定吗？' })
      if (!m.confirm) return
      wx.navigateBack()
      return
    }
    const m = await wx.showModal({ title: '结束骑行', content: '确定结束并生成轨迹海报吗？' })
    if (!m.confirm) return

    if (this.data.state === 'riding') this.movingMs += Date.now() - this.resumedAt
    this.stopLocation()
    if (this.timer) clearInterval(this.timer)
    this.setData({ state: 'paused' })

    const durationSec = Math.round(this.movingMs / 1000)
    const ride = {
      routeId: this.routeId,
      text: this.route ? this.route.text : '',
      track: this.segments
        .filter(seg => seg.length >= 2)
        .map(seg => geo.simplify(seg, 10).map(p => [p.latitude, p.longitude])),
      distance: Math.round(this.distance),
      durationSec,
      avgSpeed: durationSec > 0 ? this.distance / durationSec : 0,
      startedAt: this.startedAt,
      endedAt: Date.now()
    }
    app.globalData.lastRide = ride

    wx.showLoading({ title: '保存中…' })
    let url = '/pages/record/record'
    try {
      const res = await wx.cloud.database().collection('rides').add({ data: ride })
      url += '?id=' + res._id
    } catch (err) {
      console.error('云端保存失败，仅本地展示', err)
      wx.showToast({ title: '云端保存失败，海报仍可生成', icon: 'none' })
    }
    wx.hideLoading()
    wx.redirectTo({ url })
  }
})
