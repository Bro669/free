// 骑行中：目标路线叠加 + GPS 轨迹记录（精度/漂移/抖动三重过滤），暂停分段
// 沿线导航：字形路线不能交给外部导航（会重新规划毁掉字形），
// 由 guidance.js 做轨迹匹配，给出转向提示/偏航报警/完成进度。
const geo = require('../../utils/geo')
const fmt = require('../../utils/format')
const guidance = require('../../utils/guidance')
const tts = require('../../utils/tts')

const app = getApp()

const TURN_ALERT_DIST = 60      // 距转弯多少米开始震动提醒
const FOLLOW_INTERVAL = 3000    // 地图跟随节流（ms）

const DIR_TEXT = { left: '左转', right: '右转', uturn: '掉头' }
const DIR_ARROW = { left: '⬅', right: '➡', uturn: '↩' }

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
    progressText: '--',
    hasGuide: false,
    nav: null,                 // { arrow, text, cls }
    voiceAvailable: false,
    voiceOn: true,
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
    this.tracker = null        // 沿线导航匹配器
    this.alertedTurnIdx = -1
    this.wasOffRoute = false
    this.lastFollowAt = 0
    this.turnSpoken = {}       // turnIdx -> 已播报阶段（1=远距 2=近距）
    this.lastRideFlag = null   // 上一次匹配所在段类型（骑行/推行）
    this.spokeFinished = false
    this.mapCtx = wx.createMapContext('map')
    this.setData({ voiceAvailable: tts.isAvailable() })
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
      const start = this.route.polyline[0] && this.route.polyline[0][0]
      const markers = start ? [{
        id: 1,
        latitude: start[0],
        longitude: start[1],
        width: 24,
        height: 32,
        callout: { content: '起点', display: 'ALWAYS', borderRadius: 6, padding: 4, fontSize: 12 }
      }] : []
      this.setData({ polylines, includePoints, markers })
      this.buildGuidance()
    } catch (err) {
      console.error('加载路线失败', err)
      wx.showToast({ title: '路线加载失败，仍可自由骑行', icon: 'none' })
    }
  },

  // 按骑行顺序重组路线（笔画与衔接段在设计时交替生成：笔0 接0 笔1 接1 …）
  buildGuidance() {
    const toPts = line => line.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
    const conns = this.route.connectors || []
    const sections = []
    this.route.polyline.forEach((line, i) => {
      sections.push({ points: toPts(line), ride: true })
      if (conns[i]) sections.push({ points: toPts(conns[i]), ride: false })
    })
    this.guide = guidance.buildGuide(sections)
    this.tracker = guidance.createTracker(this.guide)
    this.setData({ hasGuide: true })
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
    if (this.tracker) tts.speak('开始骑行，请沿路线出发')
  },

  toggleVoice() {
    const voiceOn = !this.data.voiceOn
    tts.setEnabled(voiceOn)
    this.setData({ voiceOn })
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
    this.updateGuidance(point)
    if (verdict === 'still') {
      if (this.lastPoint) this.lastPoint.timestamp = point.timestamp
      return
    }
    if (this.lastPoint) this.distance += geo.haversine(this.lastPoint, point)
    this.lastPoint = point
    this.segments[this.segments.length - 1].push(point)
    this.renderTrack()
  },

  // ===== 沿线导航 =====
  updateGuidance(point) {
    // 地图跟随（节流）
    const now = Date.now()
    if (now - this.lastFollowAt > FOLLOW_INTERVAL) {
      this.lastFollowAt = now
      this.mapCtx.moveToLocation({ latitude: point.latitude, longitude: point.longitude })
    }
    if (!this.tracker) return
    const st = this.tracker.update(point)
    if (!st) return

    let nav
    if (st.finished) {
      nav = { arrow: '🏁', text: '路线已完成！结束骑行生成海报吧', cls: 'done' }
    } else if (st.offRoute) {
      nav = { arrow: '⚠', text: `偏离路线 ${Math.round(st.distFromPath)}m，请返回`, cls: 'off' }
      if (!this.wasOffRoute) wx.vibrateLong()
    } else if (!st.ride) {
      nav = { arrow: '🚶', text: '推行衔接段，前往下一笔', cls: 'walk' }
    } else if (st.nextTurn && st.nextTurn.dist < 800) {
      const t = st.nextTurn
      nav = { arrow: DIR_ARROW[t.dir], text: `${Math.round(t.dist)}m 后${DIR_TEXT[t.dir]}`, cls: '' }
      if (t.dist < TURN_ALERT_DIST && this.alertedTurnIdx !== t.idx) {
        this.alertedTurnIdx = t.idx
        wx.vibrateShort({ type: 'medium' })
      }
    } else {
      nav = { arrow: '⬆', text: '沿路线直行', cls: '' }
    }
    this.announce(st)
    this.wasOffRoute = st.offRoute
    this.lastRideFlag = st.ride

    const progressText = Math.min(100, Math.round(st.progress * 100)) + '%'
    const prev = this.data.nav
    if (!prev || prev.text !== nav.text || this.data.progressText !== progressText) {
      this.setData({ nav, progressText })
    }
  },

  // 语音播报：转弯两档（200m/60m）、偏航进出、推行切换、完成，各自只播一次
  announce(st) {
    if (this.data.state !== 'riding') return
    if (st.finished) {
      if (!this.spokeFinished) {
        this.spokeFinished = true
        tts.speak('恭喜，路线已完成，可以结束骑行生成海报了')
      }
      return
    }
    if (st.offRoute) {
      if (!this.wasOffRoute) tts.speak('已偏离路线，请返回')
      return
    }
    if (this.wasOffRoute) tts.speak('已回到路线')
    if (this.lastRideFlag !== null && st.ride !== this.lastRideFlag) {
      tts.speak(st.ride ? '衔接完成，继续骑行' : '本笔画完成，请推行至下一笔起点')
    }
    if (st.ride && st.nextTurn) {
      const t = st.nextTurn
      const stage = this.turnSpoken[t.idx] || 0
      if (t.dist < TURN_ALERT_DIST && stage < 2) {
        this.turnSpoken[t.idx] = 2
        tts.speak('前方' + DIR_TEXT[t.dir])
      } else if (t.dist < 220 && stage < 1) {
        this.turnSpoken[t.idx] = 1
        tts.speak('两百米后' + DIR_TEXT[t.dir])
      }
    }
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
    // 计划路线一并存档，供成果页算「还原度」与对比展示
    const planned = this.route
      ? this.route.polyline.map(line =>
          geo.simplify(line.map(([lat, lng]) => ({ latitude: lat, longitude: lng })), 15)
            .map(p => [p.latitude, p.longitude]))
      : []
    const ride = {
      routeId: this.routeId,
      text: this.route ? this.route.text : '',
      planned,
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
