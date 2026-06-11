#!/usr/bin/env node
// 无头端到端测试：node scripts/e2e-headless.js
// 完整 mock wx API（地图/定位/云数据库/canvas/存储/路线规划），真实加载页面 JS，
// 按用户路径驱动：设计→手势→自动寻位→贴路→保存→广场→详情→GPX→骑行→导航→
// 断点恢复→海报。验证页面层逻辑与数据流（真机交互/渲染仍需开发者工具与真机）。

const path = require('path')
const fs = require('fs')

let failed = 0
let passed = 0
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok  ' + name) }
  else { failed++; console.error('FAIL  ' + name + (detail ? ' — ' + detail : '')) }
}

// ===== 虚拟时间（轨迹点测速需要时间前进） =====
const realNow = Date.now.bind(Date)
let vOffset = 0
Date.now = () => realNow() + vOffset
const advance = ms => { vOffset += ms }

// ===== wx mock =====
const storage = new Map()
const cloudDB = { routes: [], rides: [], users: [] }
let docSeq = 1
const calls = { toasts: [], navigations: [], shareFiles: [], loadings: 0 }
let locationHandler = null
const fileStore = new Map()

function makeCtxProxy() {
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} })
      return () => {}
    },
    set() { return true }
  })
}

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => makeCtxProxy(),
    createImage() {
      const img = { width: 1200, height: 900, onload: null, onerror: null }
      Object.defineProperty(img, 'src', {
        set() { setTimeout(() => img.onload && img.onload(), 0) }
      })
      return img
    }
  }
}

function makeQuery() {
  const q = {
    in: () => q,
    select: () => q,
    fields: () => q,
    exec: cb => cb([{ node: makeCanvas() }])
  }
  return q
}

function matches(doc, filter) {
  return Object.keys(filter).every(k => doc[k] === filter[k])
}

function makeCollection(name) {
  const state = { filter: null, order: null, desc: false, skip: 0, limit: 100 }
  const api = {
    where(f) { state.filter = f; return api },
    field() { return api },
    orderBy(k, dir) { state.order = k; state.desc = dir === 'desc'; return api },
    skip(n) { state.skip = n; return api },
    limit(n) { state.limit = n; return api },
    async get() {
      let rows = cloudDB[name].slice()
      if (state.filter) rows = rows.filter(d => matches(d, state.filter))
      if (state.order) rows.sort((a, b) => (state.desc ? -1 : 1) * ((a[state.order] || 0) - (b[state.order] || 0)))
      return { data: rows.slice(state.skip, state.skip + state.limit).map(d => ({ ...d })) }
    },
    async add({ data }) {
      const doc = { ...data, _id: 'doc' + (docSeq++), _openid: 'test-openid' }
      cloudDB[name].push(doc)
      return { _id: doc._id }
    },
    doc(id) {
      return {
        async get() {
          const d = cloudDB[name].find(x => x._id === id)
          if (!d) throw new Error('not found')
          return { data: { ...d } }
        },
        async update({ data }) {
          Object.assign(cloudDB[name].find(x => x._id === id), data)
          return {}
        },
        async remove() {
          cloudDB[name] = cloudDB[name].filter(x => x._id !== id)
          return {}
        }
      }
    }
  }
  return api
}

// 模拟骑行路线规划：from→to 之间加一个垂直偏移 ~25m 的中间点（模拟沿路绕行）
function fakeBicycling(from, to) {
  const [flat, flng] = from.split(',').map(Number)
  const [tlat, tlng] = to.split(',').map(Number)
  const mlat = (flat + tlat) / 2 + 0.00022   // ≈25m 北偏
  const mlng = (flng + tlng) / 2
  const e6 = v => Math.round(v * 1e6)
  return {
    status: 0,
    result: {
      routes: [{
        polyline: [flat, flng,
          e6(mlat - flat), e6(mlng - flng),
          e6(tlat - mlat), e6(tlng - mlng)]
      }]
    }
  }
}

global.requirePlugin = () => { throw new Error('plugin not available in headless test') }

global.wx = {
  env: { USER_DATA_PATH: '/tmp/wxusr' },
  cloud: {
    init() {},
    database: () => ({ collection: makeCollection }),
    uploadFile({ cloudPath, success }) { success({ fileID: 'cloud://test/' + cloudPath }) }
  },
  // 按 URL 分发：腾讯路线规划 / hanzi-writer-data CDN
  request({ url, data, success, fail }) {
    if (url.includes('apis.map.qq.com')) {
      return success({ statusCode: 200, data: fakeBicycling(data.from, data.to) })
    }
    if (url.includes('hanzi-writer-data')) {
      const c = decodeURIComponent(url.split('/').pop().replace('.json', ''))
      const p = '/tmp/svgrender/node_modules/hanzi-writer-data/' + c + '.json'
      if (fs.existsSync(p)) {
        return success({ statusCode: 200, data: JSON.parse(fs.readFileSync(p)) })
      }
      return success({ statusCode: 404, data: null })
    }
    fail && fail({ errMsg: 'request:fail unknown url' })
  },
  getLocation({ success }) { success({ latitude: 31.2304, longitude: 121.4737, accuracy: 5 }) },
  getSetting({ success }) { success({ authSetting: { 'scope.userLocation': true } }) },
  authorize({ success }) { success && success() },
  openSetting({ success }) { success && success({ authSetting: { 'scope.userLocation': true } }) },
  startLocationUpdateBackground({ success }) { success && success() },
  startLocationUpdate({ success }) { success && success() },
  stopLocationUpdate() {},
  onLocationChange(h) { locationHandler = h },
  offLocationChange() { locationHandler = null },
  setKeepScreenOn() {},
  vibrateShort() {},
  vibrateLong() {},
  showToast(o) { calls.toasts.push(o.title) },
  showLoading() { calls.loadings++ },
  hideLoading() {},
  showModal(opts) {
    const res = { confirm: true, cancel: false }
    if (opts.success) { opts.success(res); return }
    return Promise.resolve(res)
  },
  createMapContext: () => ({
    getScale: ({ success }) => success({ scale: 13 }),
    getCenterLocation: ({ success }) => success({ latitude: 31.2304, longitude: 121.4737 }),
    moveToLocation: () => {}
  }),
  createSelectorQuery: makeQuery,
  canvasToTempFilePath({ success }) { success({ tempFilePath: '/tmp/poster-fake.png' }) },
  saveImageToPhotosAlbum({ success }) { success && success() },
  previewImage() {},
  chooseMedia({ success }) { success({ tempFiles: [{ tempFilePath: '/tmp/fake-photo.png' }] }) },
  setStorageSync(k, v) { storage.set(k, JSON.parse(JSON.stringify(v))) },
  getStorageSync(k) { return storage.has(k) ? JSON.parse(JSON.stringify(storage.get(k))) : '' },
  removeStorageSync(k) { storage.delete(k) },
  getWindowInfo: () => ({ pixelRatio: 2 }),
  getFileSystemManager: () => ({
    writeFileSync(p, content) { fileStore.set(p, content) }
  }),
  shareFileMessage(o) { calls.shareFiles.push(o) },
  navigateTo(o) { calls.navigations.push(o.url) },
  redirectTo(o) { calls.navigations.push(o.url) },
  switchTab(o) { calls.navigations.push(o.url) },
  navigateBack() { calls.navigations.push('BACK') },
  stopPullDownRefresh() {},
  createInnerAudioContext: () => ({ play() {}, stop() {}, onEnded() {}, onError() {} })
}

const appMock = {
  globalData: { openid: 'test-openid', cloudReady: true, pendingRoute: null, lastRide: null },
  login: async () => 'test-openid'
}
global.getApp = () => appMock

// ===== Page 加载器 =====
const registry = {}
let currentPage = null
global.Page = cfg => { registry[currentPage] = cfg }

function loadPage(name) {
  currentPage = name
  require(path.join(__dirname, '../miniprogram/pages', name, name + '.js'))
}

function applyKey(obj, key, val) {
  const parts = key.split('.')
  let o = obj
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
  o[parts[parts.length - 1]] = val
}

function createInstance(name, options = {}, { ready = true } = {}) {
  const cfg = registry[name]
  const inst = Object.create(cfg)
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}))
  inst.setData = function (patch, cb) {
    for (const k of Object.keys(patch)) applyKey(this.data, k, patch[k])
    cb && cb()
  }
  if (inst.onLoad) inst.onLoad(options)
  if (inst.onShow) inst.onShow()
  if (ready && inst.onReady) inst.onReady()
  return inst
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const touch = (x, y) => ({ clientX: x, clientY: y })

// 给 qqmap 配上 key，走 mock 路线规划
require(path.join(__dirname, '../miniprogram/config')).TENCENT_MAP_KEY = 'TEST_KEY'

for (const p of ['design', 'square', 'mine', 'routeDetail', 'ride', 'record']) loadPage(p)

async function main() {
  // ===== 0. 真实 app.js：零云函数 openid 引导 =====
  {
    let appCfg = null
    global.App = cfg => { appCfg = cfg }
    require(path.join(__dirname, '../miniprogram/app.js'))
    const realApp = Object.create(appCfg)
    realApp.globalData = JSON.parse(JSON.stringify(appCfg.globalData))
    const openid = await realApp.login()
    check('登录: users 集合引导取得 openid', openid === 'test-openid')
    check('登录: openid 已缓存本地', storage.get('openid') === 'test-openid')
    check('登录: 引导记录已清理', cloudDB.users.length === 0)
    const again = await realApp.login()
    check('登录: 二次登录走缓存', again === 'test-openid' && cloudDB.users.length === 0)
  }

  // ===== 1. 广场冷启动：空库显示灵感示例 =====
  {
    const sq = createInstance('square')
    await sq.reload()
    check('广场: 空库展示灵感示例', sq.data.demos.length >= 2 && sq.data.routes.length === 0)
    sq.useDemo({ currentTarget: { dataset: { idx: 0 } } })
    check('广场: 点击示例进设计页', appMock.globalData.pendingRoute &&
      appMock.globalData.pendingRoute.text === '♥')
    appMock.globalData.pendingRoute = null
  }

  // ===== 2. 设计全流程 =====
  const design = createInstance('design')
  {
    design.setData({ text: 'LOVE' })
    await design.generate()
    check('设计: 生成后进入 adjust', design.data.mode === 'adjust')
    check('设计: 投影出折线', design.data.polylines.length >= 4)
    const center0 = { ...design.data.center }

    // 单指拖移
    design.onGestureStart({ touches: [touch(100, 100)] })
    design.onGestureMove({ touches: [touch(150, 100)] })
    design.onGestureEnd({ touches: [] })
    await sleep(80)
    check('设计: 单指拖移改变中心（向东）', design.data.center.longitude > center0.longitude)
    check('设计: 拖移不改纬度量级', Math.abs(design.data.center.latitude - center0.latitude) < 0.001)

    // 双指捏合放大 + 旋转 90°
    design.onGestureStart({ touches: [touch(100, 200), touch(200, 200)] })
    design.onGestureMove({ touches: [touch(50, 200), touch(250, 200)] })   // 距离 ×2
    await sleep(80)
    check('设计: 双指捏合放大字高', design.data.heightMeters === 3000, 'got ' + design.data.heightMeters)
    design.onGestureStart({ touches: [touch(100, 200), touch(200, 200)] })
    design.onGestureMove({ touches: [touch(150, 150), touch(150, 250)] })  // 旋转 +90°
    await sleep(80)
    check('设计: 双指旋转 90°', design.data.rotationDeg === 90, 'got ' + design.data.rotationDeg)
    design.onGestureEnd({ touches: [] })
    design.setData({ heightMeters: 1500, rotationDeg: 0 })
    design.reproject()

    // 自动寻位
    await design.autoPlace()
    check('设计: 自动寻位完成且不报错', !calls.toasts.includes('评估失败，请手动调整'))

    // 贴合道路
    await design.snapRoads()
    check('设计: 贴路完成', design.data.mode === 'snapped')
    check('设计: 无失败段', design.data.failedCount === 0, 'got ' + design.data.failedCount)
    check('设计: 还原度为 0-100 数字', typeof design.data.fidelityScore === 'number' &&
      design.data.fidelityScore > 0 && design.data.fidelityScore <= 100,
      'got ' + design.data.fidelityScore)
    check('设计: 锚点 marker 渲染', design.data.markers.length > 10)

    // 锚点微调（只重贴相邻 2 段）
    design.onMarkerTap({ detail: { markerId: 1 } })
    check('设计: 进入锚点微调', design.data.mode === 'editAnchor')
    await design.confirmEditAnchor()
    await sleep(600)
    check('设计: 微调后回到 snapped', design.data.mode === 'snapped')

    // 保存
    design.openSaveDialog()
    check('设计: 默认路线名', design.data.routeName.includes('LOVE'))
    await design.saveRoute()
    check('设计: 路线写入云库', cloudDB.routes.length === 1)
    const doc = cloudDB.routes[0]
    check('设计: 文档结构完整', !!(doc.polyline && doc.anchors && doc.connectors &&
      doc.distance > 0 && typeof doc.fidelity === 'number' && doc.isPublic === true))
    check('设计: 缩略图已上传', doc.thumb.startsWith('cloud://test/thumbs/'))
    check('设计: 保存后跳详情', calls.navigations.some(u => u.includes('routeDetail?id=' + doc._id)))
  }
  const routeId = cloudDB.routes[0]._id

  // ===== 3. 广场出现真实路线 =====
  {
    const sq = createInstance('square')
    await sq.reload()
    check('广场: 出现公开路线且示例隐藏', sq.data.routes.length === 1 && sq.data.demos.length === 0)
    check('广场: 卡片带缩略图与还原度', !!sq.data.routes[0].thumb && sq.data.routes[0].fidelity > 0)
  }

  // ===== 4. 路线详情 + GPX 导出 =====
  {
    const det = createInstance('routeDetail', { id: routeId })
    await sleep(50)
    check('详情: 路线加载', !!det.data.route && det.data.isMine === true)
    check('详情: 起点标记', det.data.markers.length === 1)
    det.exportGpx()
    check('详情: GPX 已分享', calls.shareFiles.length === 1 &&
      calls.shareFiles[0].fileName.endsWith('.gpx'))
    const xml = fileStore.get(calls.shareFiles[0].filePath)
    check('详情: GPX 内容含轨迹点', xml && xml.includes('<trkpt') && xml.includes('</gpx>'))
    // 坐标已转 WGS-84（与 GCJ 原值不同）
    const gcjLat = cloudDB.routes[0].polyline[0][0][0].toFixed(6)
    check('详情: GPX 坐标已转 WGS-84', !xml.includes('lat="' + gcjLat + '"'))
  }

  // ===== 5. 骑行：导航 + 记录 + 完成 =====
  {
    const ride = createInstance('ride', { routeId })
    await sleep(50)
    check('骑行: 目标路线加载 + 导航就绪', ride.data.hasGuide === true && !!ride.tracker)
    await ride.start()
    check('骑行: 进入 riding（后台定位）', ride.data.state === 'riding' && ride.data.backgroundOk === true)
    check('骑行: 定位监听已注册', typeof locationHandler === 'function')

    // 沿计划路线发定位点：点距约 200m，虚拟间隔 25s ≈ 8m/s 正常骑速
    // （间隔太短会被轨迹过滤器按「漂移跳点」丢弃——那是过滤器的正确行为）
    const line = cloudDB.routes[0].polyline[0].map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
    for (const p of line.slice(0, Math.min(line.length, 30))) {
      advance(25000)
      locationHandler({ latitude: p.latitude, longitude: p.longitude, accuracy: 5 })
    }
    check('骑行: 距离累计', ride.distance > 200, 'got ' + Math.round(ride.distance))
    check('骑行: 轨迹分段渲染', ride.data.polylines.length > ride.routePolylines.length)
    check('骑行: 导航横幅有内容', !!(ride.data.nav && ride.data.nav.text))
    check('骑行: 完成度推进', ride.data.progressText !== '--' && ride.data.progressText !== '0%')

    // 暂停/继续
    ride.pause()
    check('骑行: 暂停', ride.data.state === 'paused')
    ride.resume()
    check('骑行: 继续', ride.data.state === 'riding')

    // 断点备份
    ride.saveBackup()
    check('骑行: 备份落盘', !!storage.get('ride_backup'))

    await ride.finish()
    await sleep(50)
    check('骑行: 记录写入云库', cloudDB.rides.length === 1)
    const rideDoc = cloudDB.rides[0]
    check('骑行: 记录含轨迹与计划线', rideDoc.track.length >= 1 && rideDoc.planned.length >= 1 &&
      rideDoc.distance > 0 && rideDoc.durationSec > 0)
    check('骑行: 结束后清除备份', !storage.get('ride_backup'))
    check('骑行: 跳转成果页', calls.navigations.some(u => u.includes('record?id=' + rideDoc._id)))
  }

  // ===== 6. 断点恢复 =====
  {
    // 模拟骑到一半被杀：手工构造备份
    storage.set('ride_backup', {
      routeId: '',
      segments: [[{ latitude: 31.23, longitude: 121.47, timestamp: Date.now() },
                  { latitude: 31.232, longitude: 121.47, timestamp: Date.now() }]],
      distance: 2500,
      movingMs: 600000,
      startedAt: Date.now() - 700000,
      ts: Date.now()
    })
    const ride2 = createInstance('ride', {})
    await sleep(50)   // checkBackup 的 showModal 自动确认 → start()
    check('恢复: 自动续骑', ride2.data.state === 'riding')
    check('恢复: 里程恢复', ride2.distance === 2500)
    check('恢复: 时长恢复', ride2.movingMs === 600000)
    ride2.stopLocation()
    if (ride2.timer) clearInterval(ride2.timer)
    if (ride2.backupTimer) clearInterval(ride2.backupTimer)
    storage.delete('ride_backup')
  }

  // ===== 7. 成果页：海报 / 主题 / 金句 / 还原度 =====
  {
    const rideDoc = cloudDB.rides[0]
    const rec = createInstance('record', { id: rideDoc._id })
    await sleep(100)
    check('成果: 海报已生成', rec.data.posterPath === '/tmp/poster-fake.png')
    check('成果: 还原度得分', typeof rec.data.matchScore === 'number' &&
      rec.data.matchScore > 0 && rec.data.matchScore <= 100, 'got ' + rec.data.matchScore)
    check('成果: 金句已选', rec.data.quote.length > 0)
    const q0 = rec.data.quote
    rec.nextQuote()
    check('成果: 换一句生效', rec.data.quote !== q0)
    rec.switchCategory({ currentTarget: { dataset: { key: 'nature' } } })
    check('成果: 分类切换', rec.data.activeThemes.some(t => t.key === 'sand'))
    rec.selectTheme({ currentTarget: { dataset: { key: 'sand' } } })
    await sleep(50)
    check('成果: 切沙画主题重新生成', rec.data.themeKey === 'sand' && !!rec.data.posterPath)
    // 自定义照片主题
    rec.switchCategory({ currentTarget: { dataset: { key: 'custom' } } })
    rec.selectTheme({ currentTarget: { dataset: { key: 'custom' } } })
    await sleep(100)
    check('成果: 照片主题（选图+异步加载）', rec.data.themeKey === 'custom' && rec.data.hasBgImage === true)
    const share = rec.onShareTimeline()
    check('成果: 朋友圈分享带还原度', share.title.includes('还原度'))
  }

  // ===== 8. 我的：统计 + 收集册 =====
  {
    const mine = createInstance('mine')
    await sleep(50)
    check('我的: 路线/记录列表', mine.data.routes.length === 1 && mine.data.rides.length === 1)
    check('我的: 统计卡', mine.data.stats && mine.data.stats.count === 1)
    const lit = mine.data.letters.filter(l => l.got).map(l => l.c).join('')
    check('我的: 收集册点亮 E L O V', lit === 'ELOV', 'got ' + lit)
  }

  // ===== 9. 汉字流程（真实 hanzi-writer 数据，缺数据则跳过） =====
  {
    if (fs.existsSync('/tmp/svgrender/node_modules/hanzi-writer-data/骑.json')) {
      const d2 = createInstance('design')
      d2.setData({ text: '骑' })
      await d2.generate()
      check('汉字: 生成成功', d2.data.mode === 'adjust' && d2.data.polylines.length >= 11)
      check('汉字: 字形已缓存本地', !!storage.get('hanzi:骑'))
    } else {
      console.log('  --  汉字流程跳过（本地无 hanzi-writer-data）')
    }
  }

  console.log(`\n${passed} 通过 / ${failed} 失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
