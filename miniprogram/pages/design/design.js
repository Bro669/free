// 设计页：输入文字 → 字形投影到地图 → 缩放/旋转/移动 → 贴合道路 → 锚点微调 → 保存
const projection = require('../../utils/projection')
const geo = require('../../utils/geo')
const qqmap = require('../../utils/qqmap')
const fmt = require('../../utils/format')
const hanzi = require('../../utils/hanzi')
const fidelity = require('../../utils/fidelity')

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
    saving: false,
    fidelityScore: null,
    templates: ['♥', '★', 'LOVE', '520', '2026', '骑']
  },

  useTemplate(e) {
    this.setData({ text: e.currentTarget.dataset.t })
    this.generate()
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
      // 示例模板不带坐标（center:null），落在用户当前位置
      center: route.center
        ? { latitude: route.center.latitude, longitude: route.center.longitude }
        : this.data.center,
      routeName: route.demo ? '' : (route.name || '')
    })
    this.generate()
  },

  onTextInput(e) {
    // 不做 toUpperCase 回写：中文输入法组词阶段被改值会打断输入；
    // 字母查表时已统一大写（projection.lookupGlyph）
    this.setData({ text: e.detail.value })
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
      // 汉字字形按需从 CDN 拉取（hanzi-writer-data）
      wx.showLoading({ title: '加载汉字字形…' })
      try {
        const failed = await hanzi.ensure(cjk)
        wx.hideLoading()
        if (failed.length) {
          wx.showToast({ title: '字形加载失败: ' + failed.join(' ') + '（检查网络与域名白名单）', icon: 'none' })
          return
        }
      } catch (err) {
        wx.hideLoading()
        console.error('加载汉字字形失败', err)
        wx.showToast({ title: '字形加载失败，请检查网络与域名白名单', icon: 'none' })
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
    this.setData({ markers: [], failedCount: 0, snapProgress: '', fidelityScore: null })
  },

  // 调整参数节流合并后重投影（滑杆 changing 与手势 move 都是高频事件）
  scheduleAdjust(partial) {
    this._pendingAdjust = Object.assign(this._pendingAdjust || {}, partial)
    if (this._adjustTimer) return
    this._adjustTimer = setTimeout(() => {
      this._adjustTimer = null
      const p = this._pendingAdjust
      this._pendingAdjust = null
      this.setData(p)
      this.reproject()
    }, 50)
  },

  onHeightChange(e) {
    this.scheduleAdjust({ heightMeters: e.detail.value })
  },

  onRotationChange(e) {
    this.scheduleAdjust({ rotationDeg: e.detail.value })
  },

  toggleMove(e) {
    this.setData({ moveMode: e.detail.value })
    if (e.detail.value) this.updateMetersPerPx()
  },

  // ===== 手势编辑：单指拖移字形，双指捏合缩放 + 旋转 =====
  // 同层渲染下用透明 view 盖住地图捕获触摸，避开与 map 自身手势的冲突
  updateMetersPerPx() {
    this.mapCtx.getScale({
      success: r => {
        const lat = this.data.center.latitude * Math.PI / 180
        // Web 墨卡托：zoom z 时每逻辑像素的米数
        this.metersPerPx = 40075016.686 * Math.cos(lat) / Math.pow(2, r.scale + 8)
      }
    })
  },

  snapshotGesture(touches) {
    this.gesture = {
      touches: touches.map(p => ({ x: p.clientX, y: p.clientY })),
      center: { ...this.data.center },
      H: this.data.heightMeters,
      rot: this.data.rotationDeg
    }
  },

  onGestureStart(e) {
    this.snapshotGesture(e.touches)
    this.updateMetersPerPx()
  },

  onGestureMove(e) {
    if (!this.gesture) return
    const g = this.gesture
    const t = e.touches
    if (t.length === 1 && g.touches.length === 1) {
      // 单指拖移
      const mpp = this.metersPerPx || 19
      const dxM = (t[0].clientX - g.touches[0].x) * mpp
      const dyM = (t[0].clientY - g.touches[0].y) * mpp
      const mPerDegLat = 111320
      const mPerDegLng = mPerDegLat * Math.cos(g.center.latitude * Math.PI / 180)
      this.scheduleAdjust({
        center: {
          latitude: g.center.latitude - dyM / mPerDegLat,
          longitude: g.center.longitude + dxM / mPerDegLng
        }
      })
    } else if (t.length >= 2) {
      if (g.touches.length < 2) {
        // 第二指刚落下，重置基准
        this.snapshotGesture(t)
        return
      }
      const dist = pts => Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      const ang = pts => Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
      const now = t.map(p => ({ x: p.clientX, y: p.clientY }))
      const ratio = dist(now) / Math.max(dist(g.touches), 1)
      const dDeg = (ang(now) - ang(g.touches)) * 180 / Math.PI
      this.scheduleAdjust({
        heightMeters: Math.max(500, Math.min(5000, Math.round(g.H * ratio / 10) * 10)),
        rotationDeg: Math.round(((g.rot + dDeg) % 360 + 360) % 360)
      })
    }
  },

  onGestureEnd(e) {
    if (e.touches && e.touches.length > 0) {
      this.snapshotGesture(e.touches)   // 双指→单指等情况，以剩余触点为新基准
    } else {
      this.gesture = null
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

  // ===== 自动寻位：候选位置/角度 × 探针段快速评估，选还原度最佳的方案 =====
  // 每个候选只贴 ≤4 段探针（10 候选 ≈ 40 次 API，约 10s），不动用全量贴路配额
  async autoPlace() {
    const config = require('../../config')
    if (!config.TENCENT_MAP_KEY) {
      wx.showToast({ title: '未配置地图 Key，无法评估', icon: 'none' })
      return
    }
    if (!this.layoutResult) return
    const base = this.data.center
    const H = this.data.heightMeters
    const rot = this.data.rotationDeg
    const offM = H * 0.7
    const offs = [[0, 0], [offM, offM], [offM, -offM], [-offM, offM], [-offM, -offM]]
    const mPerDegLat = 111320
    const mPerDegLng = mPerDegLat * Math.cos(base.latitude * Math.PI / 180)
    const candidates = []
    for (const [dn, de] of offs) {
      const center = {
        latitude: base.latitude + dn / mPerDegLat,
        longitude: base.longitude + de / mPerDegLng
      }
      candidates.push({ center, rotationDeg: rot })
      candidates.push({ center, rotationDeg: (rot + 90) % 360 })
    }

    let best = null
    for (let i = 0; i < candidates.length; i++) {
      wx.showLoading({ title: `评估方案 ${i + 1}/${candidates.length}`, mask: true })
      const cand = candidates[i]
      const projected = projection.project(this.layoutResult, {
        center: cand.center, heightMeters: H, rotationDeg: cand.rotationDeg
      })
      const pairs = fidelity.probePairs(projected.filter(s => s.ride).map(s => s.points))
      let dev = 0
      for (const [a, b] of pairs) {
        const seg = await qqmap.snapSegment(a, b)
        dev += seg.snapped ? fidelity.probeDeviation(a, b, seg.points) : 300
      }
      dev = pairs.length ? dev / pairs.length : Infinity
      if (!best || dev < best.dev) best = { ...cand, dev }
    }
    wx.hideLoading()
    if (!best || !isFinite(best.dev)) {
      wx.showToast({ title: '评估失败，请手动调整', icon: 'none' })
      return
    }
    this.setData({ center: best.center, rotationDeg: best.rotationDeg })
    this.reproject()
    wx.showToast({ title: '已选用贴路效果最好的方案，可继续微调', icon: 'none', duration: 2500 })
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
    // 字形还原度：贴路结果 vs 理想字形投影
    const plannedLines = this.projected.filter(s => s.ride).map(s => s.points)
    const snappedLines = this.segmentsByStroke.map(segs => segs.flatMap(seg => seg.points))
    const fidelityScore = fidelity.score(plannedLines, snappedLines)

    if (this.data.mode !== 'editAnchor') this.setData({ mode: 'snapped' })
    this.setData({
      polylines,
      markers,
      failedCount,
      fidelityScore,
      snapProgress: '',
      distanceText: '骑行约 ' + fmt.formatDistance(rideDist)
    })
    if (failedCount > 0) {
      wx.showToast({ title: `${failedCount} 段未能贴路，以虚线直连`, icon: 'none' })
    } else if (fidelityScore < 60) {
      wx.showToast({ title: '还原度偏低，试试旋转字形对齐路网，或换个路网更密的位置', icon: 'none', duration: 3000 })
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
      doc.thumb = await this.makeThumb(doc)   // 失败返回 ''，不阻塞保存
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

  // 渲染路线形状缩略图并上传云存储，返回 fileID（任一步失败返回 ''）
  makeThumb(doc) {
    return new Promise(resolve => {
      const done = v => resolve(v || '')
      try {
        const SIZE = 300
        wx.createSelectorQuery().in(this)
          .select('#thumb').fields({ node: true }).exec(res => {
            if (!res[0] || !res[0].node) return done('')
            const canvas = res[0].node
            canvas.width = SIZE
            canvas.height = SIZE
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#F4F7F5'
            ctx.fillRect(0, 0, SIZE, SIZE)
            const poster = require('../../utils/poster')
            const segments = doc.polyline.map(line =>
              line.map(([lat, lng]) => ({ latitude: lat, longitude: lng })))
            poster.drawTrack(ctx, segments, { x: 20, y: 20, w: SIZE - 40, h: SIZE - 40 }, [
              { color: 'rgba(25,195,125,0.3)', width: 16 },
              { color: '#19C37D', width: 8 }
            ])
            wx.canvasToTempFilePath({
              canvas,
              success: r => {
                wx.cloud.uploadFile({
                  cloudPath: `thumbs/${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`,
                  filePath: r.tempFilePath,
                  success: u => done(u.fileID),
                  fail: () => done('')
                })
              },
              fail: () => done('')
            })
          })
      } catch (e) {
        console.warn('缩略图生成失败', e)
        done('')
      }
    })
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
      fidelity: this.data.fidelityScore,
      isPublic: this.data.isPublic,
      createdAt: Date.now()
    }
  },

  onShareAppMessage() {
    return { title: '骑字——在城市里骑出你的名字' }
  }
})
