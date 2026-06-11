#!/usr/bin/env node
// 纯函数模块自检：node scripts/selftest.js
// 本项目无法在 CI 跑微信模拟器，utils 全部写成无 wx 依赖的纯函数，用本脚本回归。

const path = require('path')
const U = p => require(path.join(__dirname, '../miniprogram/utils', p))

const glyphs = U('glyphs')
const { layout, project } = U('projection')
const geo = U('geo')
const { decodePolyline } = U('qqmap')
const fmt = U('format')

let failed = 0
function check(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name) }
  else { failed++; console.error('FAIL  ' + name + (detail ? ' — ' + detail : '')) }
}
function near(a, b, eps) { return Math.abs(a - b) <= eps }

// ---- glyphs：坐标范围 / 笔画数 / 点数 ----
{
  const keys = Object.keys(glyphs)
  check('glyphs 覆盖 A-Z 0-9 与空格', keys.length === 37)
  for (const [c, g] of Object.entries(glyphs)) {
    if (c === ' ') continue
    check(`glyph ${c} width 合理`, g.width > 0 && g.width <= 1)
    check(`glyph ${c} 笔画数 ≤2`, g.strokes.length >= 1 && g.strokes.length <= 2)
    for (const s of g.strokes) {
      check(`glyph ${c} 每笔 ≥2 点`, s.points.length >= 2)
      const inBox = s.points.every(([x, y]) => x >= 0 && x <= g.width + 1e-9 && y >= 0 && y <= 1)
      check(`glyph ${c} 点都在 [0,width]x[0,1] 盒内`, inBox)
    }
  }
}

// ---- layout：衔接段插入与宽度 ----
{
  const single = layout('L')
  check('layout 单字符无衔接段', single.strokes.length === 1 && single.strokes[0].ride === true)

  const ab = layout('AB')
  const connectors = ab.strokes.filter(s => s.ride === false)
  check('layout AB 字符间恰好 1 个衔接段', connectors.length === 1)
  check('layout AB 总宽 = wA + gap + wB',
    near(ab.width, glyphs.A.width + 0.25 + glyphs.B.width, 1e-9), 'got ' + ab.width)

  const q = layout('Q')   // Q 有 2 笔 → 笔画间 1 个衔接段
  check('layout Q 笔画间插入衔接段', q.strokes.filter(s => !s.ride).length === 1)

  const lower = layout('ab')
  check('layout 自动大写', lower.width === ab.width)
}

// ---- projection：字高 / 旋转 / 纬度修正 ----
{
  const center = { latitude: 31.2304, longitude: 121.4737 }  // 上海
  const H = 1500
  const lay = layout('I')
  const strokes = project(lay, { center, heightMeters: H, rotationDeg: 0 })
  const all = strokes.flatMap(s => s.points)
  // 纬度方向（字高）跨度应 ≈ H 米
  const b0 = geo.bbox(all)
  const spanNS = geo.haversine(
    { latitude: b0.minLat, longitude: center.longitude },
    { latitude: b0.maxLat, longitude: center.longitude })
  check('project 字高 ≈ heightMeters', near(spanNS, H, H * 0.01), 'got ' + spanNS.toFixed(1))

  // 旋转 90° 后字高方向变成东西向
  const rot = project(lay, { center, heightMeters: H, rotationDeg: 90 })
  const b90 = geo.bbox(rot.flatMap(s => s.points))
  const spanEW = geo.haversine(
    { latitude: center.latitude, longitude: b90.minLng },
    { latitude: center.latitude, longitude: b90.maxLng })
  check('project 旋转 90° 后东西向跨度 ≈ heightMeters',
    near(spanEW, H, H * 0.01), 'got ' + spanEW.toFixed(1))

  // 高纬度（赫尔辛基 60°N）字形不应横向压扁：O 的横纵米跨度比保持
  const o = layout('O')
  for (const lat of [31.2304, 60.17]) {
    const c = { latitude: lat, longitude: 24.94 }
    const pts = project(o, { center: c, heightMeters: H }).flatMap(s => s.points)
    const b = geo.bbox(pts)
    const spanY = geo.haversine({ latitude: b.minLat, longitude: c.longitude }, { latitude: b.maxLat, longitude: c.longitude })
    const spanX = geo.haversine({ latitude: c.latitude, longitude: b.minLng }, { latitude: c.latitude, longitude: b.maxLng })
    check(`project O 纬度 ${lat} 宽高米数比 ≈ 0.6/1`, near(spanX / spanY, 0.6, 0.01),
      'got ' + (spanX / spanY).toFixed(3))
  }
}

// ---- geo ----
{
  const a = { latitude: 31, longitude: 121 }
  const b = { latitude: 31.009, longitude: 121 }   // 约 1 km
  check('haversine 1km 量级', near(geo.haversine(a, b), 1001, 5), geo.haversine(a, b).toFixed(1))

  // resample：3km 直线按 400m 采样 → 首尾 + 中间点，相邻间距 ≈400m
  const line = [a, { latitude: 31.027, longitude: 121 }]
  const rs = geo.resample(line, 400)
  check('resample 点数合理', rs.length >= 7 && rs.length <= 9, 'got ' + rs.length)
  let spacingOk = true
  for (let i = 1; i < rs.length - 1; i++) {
    if (!near(geo.haversine(rs[i - 1], rs[i]), 400, 8)) spacingOk = false
  }
  check('resample 间距 ≈400m', spacingOk)
  check('resample 保留末点', rs[rs.length - 1].latitude === line[1].latitude)

  // simplify：直线上的中间点应被抽掉，拐点保留
  const zig = [
    { latitude: 31, longitude: 121 },
    { latitude: 31.001, longitude: 121 },          // 共线，应被抽稀
    { latitude: 31.002, longitude: 121 },
    { latitude: 31.002, longitude: 121.002 }       // 拐点
  ]
  const simp = geo.simplify(zig, 10)
  check('simplify 抽掉共线点保留拐点', simp.length === 3, 'got ' + simp.length)

  // classifyTrackPoint
  const t0 = { latitude: 31, longitude: 121, accuracy: 5, timestamp: 0 }
  check('过滤：精度差', geo.classifyTrackPoint(t0, { latitude: 31.0001, longitude: 121, accuracy: 80, timestamp: 1000 }) === 'inaccurate')
  check('过滤：漂移跳点', geo.classifyTrackPoint(t0, { latitude: 31.01, longitude: 121, accuracy: 5, timestamp: 1000 }) === 'jump')
  check('过滤：静止抖动', geo.classifyTrackPoint(t0, { latitude: 31.00001, longitude: 121, accuracy: 5, timestamp: 1000 }) === 'still')
  check('过滤：正常点', geo.classifyTrackPoint(t0, { latitude: 31.0001, longitude: 121, accuracy: 5, timestamp: 2000 }) === 'ok')
}

// ---- decodePolyline（构造差分数据：39.98 116.30 → +0.001,+0.002 → +0.001,-0.001）----
{
  const pts = decodePolyline([39.98, 116.3, 1000, 2000, 1000, -1000])
  check('decode 点数', pts.length === 3)
  check('decode 首点', pts[0].latitude === 39.98 && pts[0].longitude === 116.3)
  check('decode 差分还原', near(pts[1].latitude, 39.981, 1e-9) && near(pts[1].longitude, 116.302, 1e-9))
  check('decode 负差分', near(pts[2].latitude, 39.982, 1e-9) && near(pts[2].longitude, 116.301, 1e-9))
}

// ---- guidance：转向检测 / 折返进度匹配 / 偏航滞回 ----
{
  const guidance = U('guidance')
  const LAT_M = 1 / 111320                       // 1 米对应的纬度
  const LNG_M = 1 / (111320 * Math.cos(31 * Math.PI / 180))
  const P = (n, e) => ({ latitude: 31 + n * LAT_M, longitude: 121 + e * LNG_M })  // 北 n 米、东 e 米

  // L 形：向北 500m 再向东 500m → 一个右转 ≈90°
  const lGuide = guidance.buildGuide([{ points: [P(0, 0), P(500, 0), P(500, 500)], ride: true }])
  check('guidance L 形检测到 1 个拐点', lGuide.turns.length === 1, 'got ' + lGuide.turns.length)
  check('guidance 北→东为右转', lGuide.turns[0] && lGuide.turns[0].dir === 'right')
  check('guidance 拐点角度 ≈90°', lGuide.turns[0] && near(Math.abs(lGuide.turns[0].deg), 90, 2))

  // 向北 400m 再原路折返 → 掉头；且折返时进度必须继续增长（窗口匹配不回跳）
  const back = guidance.buildGuide([{ points: [P(0, 0), P(400, 0), P(0, 0)], ride: true }])
  check('guidance 折返检测为掉头', back.turns.length === 1 && back.turns[0].dir === 'uturn')
  const tracker = guidance.createTracker(back)
  let monotonic = true
  let prev = -1
  // 模拟骑行：北上 0→390，再南下 390→10（同一条线，折返）
  const sim = []
  for (let d = 0; d <= 390; d += 30) sim.push(P(d, 3))      // 偏东 3m 模拟 GPS 抖动
  for (let d = 360; d >= 10; d -= 30) sim.push(P(d, -3))
  for (const pos of sim) {
    const st = tracker.update(pos)
    if (st.distAlong < prev - 15) monotonic = false          // 容许投影抖动 15m
    prev = st.distAlong
  }
  check('guidance 折返路线进度不回跳', monotonic)
  check('guidance 折返末段进度过 90%', prev > back.total * 0.9, 'got ' + (prev / back.total).toFixed(2))

  // 偏航：偏离 60m 触发，回到 20m 解除
  const t2 = guidance.createTracker(lGuide)
  t2.update(P(100, 0))
  check('guidance 在线上不偏航', t2.update(P(120, 10)).offRoute === false)
  check('guidance 偏 60m 报偏航', t2.update(P(150, 60)).offRoute === true)
  check('guidance 偏 35m 仍保持偏航（滞回）', t2.update(P(170, 35)).offRoute === true)
  check('guidance 回到 20m 解除偏航', t2.update(P(190, 20)).offRoute === false)

  // 下一个转弯距离
  const t3 = guidance.createTracker(lGuide)
  const st3 = t3.update(P(300, 0))
  check('guidance 下一转弯距离 ≈200m', st3.nextTurn && near(st3.nextTurn.dist, 200, 10),
    st3.nextTurn ? 'got ' + st3.nextTurn.dist.toFixed(0) : 'null')

  // 推行衔接段不出转向提示
  const mixed = guidance.buildGuide([
    { points: [P(0, 0), P(300, 0)], ride: true },
    { points: [P(300, 0), P(300, 200)], ride: false },
    { points: [P(300, 200), P(600, 200)], ride: true }
  ])
  check('guidance 推行段两端不计转向', mixed.turns.length === 0, 'got ' + mixed.turns.length)
  const t4 = guidance.createTracker(mixed)
  const st4 = t4.update(P(300, 100))
  check('guidance 推行段 ride=false', st4.ride === false)
}

// ---- poster：mock ctx 验证绘制不抛错且轨迹落在画布内 ----
{
  const poster = U('poster')
  const drawn = []
  const mockCtx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (prop === 'moveTo' || prop === 'lineTo') return (x, y) => drawn.push([x, y])
      return () => {}
    },
    set() { return true }
  })
  const segments = [[
    { latitude: 31, longitude: 121 },
    { latitude: 31.005, longitude: 121 },
    { latitude: 31.005, longitude: 121.005 }
  ]]
  const themes = poster.themeList()
  check('poster 主题包含沙画', themes.some(t => t.key === 'sand'))
  check('poster 主题数量 ≥5', themes.length >= 5, 'got ' + themes.length)
  for (const t of themes) {
    drawn.length = 0
    let threw = false
    try {
      poster.drawPoster(mockCtx, 750, 1334, {
        segments, text: 'L', distanceKm: '1.1',
        durationText: '5:00', speedText: '13.0', dateText: '2026.06.11'
      }, t.key)
    } catch (e) { threw = true; console.error(e) }
    check(`poster [${t.key}] 绘制不抛错`, !threw)
    check(`poster [${t.key}] 轨迹点都在画布内`,
      drawn.length > 0 && drawn.every(([x, y]) => x >= 0 && x <= 750 && y >= 0 && y <= 1334))
  }
}

// ---- format ----
{
  check('formatDistance', fmt.formatDistance(15300) === '15.3 km' && fmt.formatDistance(800) === '800 m')
  check('formatDuration', fmt.formatDuration(3725) === '1:02:05' && fmt.formatDuration(95) === '1:35')
  check('formatSpeed', fmt.formatSpeed(5) === '18.0')
}

console.log(failed === 0 ? '\n全部通过 ✔' : `\n${failed} 项失败 ✘`)
process.exit(failed === 0 ? 0 : 1)
