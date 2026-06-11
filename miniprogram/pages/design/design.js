// 设计页：输入文字 → 字形投影到地图 → 缩放/旋转/移动 → 贴合道路 → 锚点微调 → 保存
const projection = require('../../utils/projection')
const geo = require('../../utils/geo')
const qqmap = require('../../utils/qqmap')
const fmt = require('../../utils/format')
const hanzi = require('../../utils/hanzi')

const app = getApp()

const ANCHOR_SPACING = 400        // 贴路锚点间距（米）
const COLOR_RIDE = '#19C37D'
const COLOR_SNAPPED = '#0E9F66'
const COLOR_FAILED = '#FF9F40'
const COLOR_CONNECTOR = '#9AA39E'

Page({
  data: {
    // input | adjust | snapping | snapped | editAnchor
    mode: 'input',
    text: '',
    heightMeters: 1500,
    rotationDeg: 0,
    moveMode: false,
    center: { latitude: 39.9087, longitude: 116.3975 },
    located: false,
    polylines: [],
    markers: [],
    snapProgress: '',
    failedCount: 0,
    distanceText: '',
    saveDialogVisible: false,
    routeName: '',
    isPublic: true,
    saving: false
  },

  onLoad() {
    this.mapCtx = wx.createMapContext('map')
    this.layoutResult = null   // projection.layout 结果
    this.projected = null      // 投影后的笔画（经纬度）
    this.anchorsByStroke = null
    this.segmentsByStroke = null
    this.editing = null        // { s, i } 正在微调的锚点
    this.locate()
  },

  onShow() {
    const pending = app.globalData.pendingRoute
    if (pending) {
      app.globalData.pendingRoute = null
      this.restoreRoute(pending)
    }
  },

  locate() {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        this.setData({ center: { latitude: res.latitude, longitude: res.longitude }, located: true })
        if (this.layoutResult) this.reproject()
      },
      fail: () => {
        wx.showToast({ title: '未授权定位，请手动移动地图', icon: 'none' })
      }
    })
  },

  restoreRoute(route) {
    this.setData({
      text: route.text,
      heightMeters: route.heightMeters,
      rotationDeg: route.rotationDeg,
      center: { latitude: route.center.latitude, longitude: route.center.longitude },
      routeName: route.name || ''
    })
    this.generate()
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value.toUpperCase() })
  },

  async generate() {
    const text = this.data.text.trim()
    if (!text) {
      wx.showToast({ title: '先输入要骑的字', icon: 'none' })
      return
    }
    const bad = projection.unsupportedChars(text, hanzi.glyphMap())
    if (bad.length) {
      const cjk = bad.filter(c => hanzi.isCJK(c))
      const other = bad.filter(c => !hanzi.isCJK(c))
      if (other.length) {
        wx.showToast({ title: '暂不支持: ' + other.join(' ') + '（支持 A-Z 0-9 和汉字）', icon: 'none' })
        return
      }
      // 汉字字形按需从云端拉取（getHanzi 云函数）
      wx.showLoading({ title: '加载汉字字形…' })
      try {
        const failed = await hanzi.ensure(cjk)
        wx.hideLoading()
        if (failed.length) {
          wx.showToast({ title: '字形加载失败: ' + failed.join(' '), icon: 'none' })
          return
        }
      } catch (err) {
        wx.hideLoading()
        console.error('加载汉字字形失败', err)
        wx.showToast({ title: '加载失败，请确认已部署 getHanzi 云函数', icon: 'none' })
        return
      }
    }
    this.layoutResult = projection.layout(text, hanzi.glyphMap())
    const rideStrokes = this.layoutResult.strokes.filter(s => s.ride !== false).length
    if (rideStrokes > 36) {
      wx.showToast({ title: `共 ${rideStrokes} 笔，路线会很复杂，建议减少字数`, icon: 'none', duration: 3000 })
    }
    this.clearSnap()
    this.setData({ mode: 'adjust', moveMode: false })
    this.reproject()
  },

  // 用当前 center/height/rotation 重新投影并渲染预览
  reproject() {
    if (!this.layoutResult) return
    this.projected = projection.project(this.layoutResult, {
      center: this.data.center,
      heightMeters: this.data.heightMeters,
      rotationDeg: this.data.rotationDeg
    })
    const polylines = this.projected.map(s => ({
      points: s.points,
      color: s.ride ? COLOR_RIDE : COLOR_CONNECTOR,
      width: s.ride ? 6 : 3,
      dottedLine: !s.ride
    }))
    const rideDist = this.projected.filter(s => s.ride)
      .reduce((d, s) => d + geo.pathDistance(s.points), 0)
    this.setData({
      polylines,
      markers: [],
      distanceText: '骑行约 ' + fmt.formatDistance(rideDist) + '（贴路后会变长）'
    })
  },

  clearSnap() {
    this.anchorsByStroke = null
    this.segmentsByStroke = null
    this.editing = null
    this.setData({ markers: [], failedCount: 0, snapProgress: '' })
  },

  onHeightChange(e) {
    this.setData({ heightMeters: e.detail.value })
    this.reproject()
  },

  onRotationChange(e) {
    this.setData({ rotationDeg: e.detail.value })
    this.reproject()
  },

  toggleMove(e) {
    this.setData({ moveMode: e.detail.value })
  },

  onRegionChange(e) {
    if (e.type !== 'end') return
    // 「移动」模式：拖地图即拖字（地图中心 = 字形中心）
    if (this.data.mode === 'adjust' && this.data.moveMode) {
      this.mapCtx.getCenterLocation({
        success: res => {
          this.setData({ center: { latitude: res.latitude, longitude: res.longitude } })
          this.reproject()
        }
      })
    }
  },

  backToInput() {
    this.clearSnap()
    this.setData({ mode: 'input', polylines: [], distanceText: '' })
  },

  backToAdjust() {
    this.clearSnap()
    this.setData({ mode: 'adjust' })
    this.reproject()
  },

  // ===== 贴合道路 =====
  async snapRoads() {
    if (!this.projected) return
    const rideStrokes = this.projected.filter(s => s.ride)
    this.anchorsByStroke = rideStrokes.map(s => geo.resample(s.points, ANCHOR_SPACING))
    const total = this.anchorsByStroke.reduce((n, a) => n + a.length - 1, 0)
    let done = 0
    this.setData({ mode: 'snapping', moveMode: false, snapProgress: `0/${total} 段` })

    this.segmentsByStroke = []
    for (const anchors of this.anchorsByStroke) {
      const segs = await qqmap.snapAnchors(anchors, () => {
        done++
        this.setData({ snapProgress: `${done}/${total} 段` })
      })
      this.segmentsByStroke.push(segs)
    }
    this.renderSnapped()
  },

  renderSnapped() {
    const polylines = []
    let failedCount = 0
    let rideDist = 0
    this.segmentsByStroke.forEach(segs => {
      const merged = []
      segs.forEach(seg => {
        rideDist += geo.pathDistance(seg.points)
        if (seg.snapped) {
          merged.push(...seg.points)
        } else {
          failedCount++
          polylines.push({ points: seg.points, color: COLOR_FAILED, width: 5, dottedLine: true })
        }
      })
      if (merged.length >= 2) {
        polylines.push({ points: geo.simplify(merged, 5), color: COLOR_SNAPPED, width: 6 })
      }
    })
    // 衔接段（推行）保持虚线
    this.projected.filter(s => !s.ride).forEach(s => {
      polylines.push({ points: s.points, color: COLOR_CONNECTOR, width: 3, dottedLine: true })
    })
    const markers = []
    this.anchorsByStroke.forEach((anchors, s) => {
      anchors.forEach((p, i) => {
        markers.push({
          id: s * 1000 + i,
          latitude: p.latitude,
          longitude: p.longitude,
          width: 18,
          height: 26,
          alpha: 0.85
        })
      })
    })
    if (this.data.mode !== 'editAnchor') this.setData({ mode: 'snapped' })
    this.setData({
      polylines,
      markers,
      failedCount,
      snapProgress: '',
      distanceText: '骑行约 ' + fmt.formatDistance(rideDist)
    })
    if (failedCount > 0) {
      wx.showToast({ title: `${failedCount} 段未能贴路，以虚线直连`, icon: 'none' })
    }
  },

  // ===== 锚点微调：点选锚点 → 拖地图（十字准星）→ 确定 =====
  onMarkerTap(e) {
    if (this.data.mode !== 'snapped') return
    const id = e.detail.markerId
    const s = Math.floor(id / 1000)
    const i = id % 1000
    const p = this.anchorsByStroke[s][i]
    this.editing = { s, i }
    this.setData({ mode: 'editAnchor' })
    this.mapCtx.moveToLocation({ latitude: p.latitude, longitude: p.longitude })
  },

  cancelEditAnchor() {
    this.editing = null
    this.setData({ mode: 'snapped' })
  },

  confirmEditAnchor() {
    const { s, i } = this.editing
    this.mapCtx.getCenterLocation({
      success: async res => {
        const np = { latitude: res.latitude, longitude: res.longitude }
        this.anchorsByStroke[s][i] = np
        const anchors = this.anchorsByStroke[s]
        const segs = this.segmentsByStroke[s]
        wx.showLoading({ title: '重新贴路…' })
        // 只重贴受影响的相邻 ≤2 段
        if (i > 0) segs[i - 1] = await qqmap.snapSegment(anchors[i - 1], np)
        if (i < anchors.length - 1) segs[i] = await qqmap.snapSegment(np, anchors[i + 1])
        wx.hideLoading()
        this.editing = null
        this.setData({ mode: 'snapped' })
        this.renderSnapped()
      }
    })
  },

  // ===== 保存 =====
  openSaveDialog() {
    this.setData({
      saveDialogVisible: true,
      routeName: this.data.routeName || ('骑个 ' + this.data.text)
    })
  },

  closeSaveDialog() {
    this.setData({ saveDialogVisible: false })
  },

  onNameInput(e) { this.setData({ routeName: e.detail.value }) },
  onPublicChange(e) { this.setData({ isPublic: e.detail.value }) },

  async saveRoute() {
    if (this.data.saving) return
    const name = this.data.routeName.trim()
    if (!name) {
      wx.showToast({ title: '给路线起个名字', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const doc = this.buildRouteDoc(name)
      const db = wx.cloud.database()
      const res = await db.collection('routes').add({ data: doc })
      this.setData({ saving: false, saveDialogVisible: false })
      wx.navigateTo({ url: '/pages/routeDetail/routeDetail?id=' + res._id })
    } catch (err) {
      console.error('保存失败', err)
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败，请确认云环境与 routes 集合已创建', icon: 'none' })
    }
  },

  buildRouteDoc(name) {
    let distance = 0
    const polyline = []   // 骑行主线（贴路结果，抽稀，每笔一条）
    this.segmentsByStroke.forEach(segs => {
      const merged = []
      segs.forEach(seg => {
        distance += geo.pathDistance(seg.points)
        merged.push(...seg.points)
      })
      polyline.push(geo.simplify(merged, 8).map(p => [p.latitude, p.longitude]))
    })
    const connectors = this.projected.filter(s => !s.ride)
      .map(s => s.points.map(p => [p.latitude, p.longitude]))
    return {
      name,
      text: this.data.text,
      center: this.data.center,
      heightMeters: this.data.heightMeters,
      rotationDeg: this.data.rotationDeg,
      anchors: this.anchorsByStroke.map(a => a.map(p => [p.latitude, p.longitude])),
      polyline,
      connectors,
      distance: Math.round(distance),
      isPublic: this.data.isPublic,
      createdAt: Date.now()
    }
  },

  onShareAppMessage() {
    return { title: '骑字——在城市里骑出你的名字' }
  }
})
