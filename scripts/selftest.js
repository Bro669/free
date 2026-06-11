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
  check('glyphs 覆盖 A-Z 0-9 空格与 ♥★', keys.length === 39 && glyphs['♥'] && glyphs['★'])
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

// ---- hanzi：medians 转换 / RDP 拐点保留 / 动态字形排版 ----
{
  const hanzi = U('hanzi')
  check('hanzi.isCJK', hanzi.isCJK('骑') && !hanzi.isCJK('A') && !hanzi.isCJK('8'))

  // 横折笔画（hanzi-writer 坐标：1024 盒、y 向上）：水平 800,580→200,580 再竖直降到 200,120
  // 中间加共线点验证 RDP 抽掉、拐点保留
  const medians = [
    [[800, 580], [600, 580], [400, 580], [200, 580], [200, 400], [200, 120]],
    [[100, 800], [900, 800]]
  ]
  const g = hanzi.convertMedians(medians)
  check('hanzi 转换笔画数', g.strokes.length === 2 && g.width === 1)
  check('hanzi RDP 共线点被抽稀、拐点保留', g.strokes[0].points.length === 3,
    'got ' + g.strokes[0].points.length)
  const inBox = g.strokes.every(s => s.points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1))
  check('hanzi 归一化在 [0,1] 盒内', inBox)
  // y 翻转：hanzi y=800（高处）→ v 小（靠上）
  check('hanzi y 轴翻转正确', g.strokes[1].points[0][1] < 0.2,
    'got v=' + g.strokes[1].points[0][1].toFixed(3))

  // 动态字形可参与排版，且与内置字形混排
  const extra = { '骑': g }
  check('unsupportedChars 识别动态字形', U('projection').unsupportedChars('骑A', extra).length === 0)
  const lay = U('projection').layout('骑8', extra)
  // 骑(2笔) + 8(1笔) = 3 骑行笔 + 2 衔接段
  check('layout 汉字混排笔画数', lay.strokes.filter(s => s.ride).length === 3 &&
    lay.strokes.filter(s => !s.ride).length === 2)
}

// ---- fidelity：还原度评分 ----
{
  const fidelity = U('fidelity')
  const LAT_M = 1 / 111320
  const LNG_M = 1 / (111320 * Math.cos(31 * Math.PI / 180))
  const P = (n, e) => ({ latitude: 31 + n * LAT_M, longitude: 121 + e * LNG_M })
  const lineA = [[P(0, 0), P(1000, 0)]]                      // 南北 1km 直线
  check('fidelity 完全重合 = 100 分', fidelity.score(lineA, [[P(0, 0), P(1000, 0)]]) === 100)
  const off20 = [[P(0, 20), P(1000, 20)]]                    // 平移 20m（GPS 噪声量级）
  const s20 = fidelity.score(lineA, off20)
  check('fidelity 偏 20m 得高分', s20 >= 80 && s20 < 100, 'got ' + s20)
  const off200 = [[P(0, 200), P(1000, 200)]]
  const s200 = fidelity.score(lineA, off200)
  check('fidelity 偏 200m 得低分', s200 < 30, 'got ' + s200)
  check('fidelity 分数单调', s20 > s200)
  check('fidelity 空输入安全', fidelity.score([], lineA) === 0)
}

// ---- fidelity 探针（自动寻位用） ----
{
  const fidelity = U('fidelity')
  const LAT_M = 1 / 111320
  const LNG_M = 1 / (111320 * Math.cos(31 * Math.PI / 180))
  const P = (n, e) => ({ latitude: 31 + n * LAT_M, longitude: 121 + e * LNG_M })
  const lines = [
    [P(0, 0), P(2000, 0)],          // 长笔
    [P(0, 100), P(900, 100)],       // 中笔
    [P(0, 200), P(100, 200)]        // 短笔（resample 后只有首尾）
  ]
  const pairs = fidelity.probePairs(lines, 4)
  check('probePairs 数量 ≤4 且 ≥2', pairs.length >= 2 && pairs.length <= 4, 'got ' + pairs.length)
  const ok = pairs.every(([a, b]) => {
    const d = U('geo').haversine(a, b)
    return d > 50 && d <= 550   // 锚距 400m，末段合并最长约 1.3 倍
  })
  check('probePairs 段长在锚距量级', ok)
  // 贴路结果完全沿直线 → 偏差 0；绕路 50% → 加惩罚
  const [a, b] = pairs[0]
  check('probeDeviation 直线为 0', fidelity.probeDeviation(a, b, [a, b]) < 1)
  const detourPt = P(200, 150)
  const dev = fidelity.probeDeviation(P(0, 0), P(400, 0), [P(0, 0), detourPt, P(400, 0)])
  check('probeDeviation 绕路有惩罚', dev > 30, 'got ' + dev.toFixed(0))
}

// ---- gpx：坐标转换 + GPX 结构 ----
{
  const geo = U('geo')
  const gpx = U('gpx')
  // GCJ→WGS：国内点偏移应在 100-700m 量级，国外点不变
  const sh = { latitude: 31.2304, longitude: 121.4737 }
  const wgs = geo.gcj02ToWgs84(sh)
  const shift = geo.haversine(sh, wgs)
  check('gcj02→wgs84 偏移量级合理', shift > 50 && shift < 800, 'got ' + shift.toFixed(0) + 'm')
  const abroad = { latitude: 48.8566, longitude: 2.3522 }
  const same = geo.gcj02ToWgs84(abroad)
  check('gcj02→wgs84 境外不转换', same.latitude === abroad.latitude && same.longitude === abroad.longitude)

  const xml = gpx.buildTrackGpx('骑个 "L" & <test>', [
    [sh, { latitude: 31.24, longitude: 121.4737 }],
    [{ latitude: 31.24, longitude: 121.4737 }, { latitude: 31.24, longitude: 121.48 }]
  ])
  check('gpx 结构完整', xml.includes('<gpx') && xml.includes('</gpx>') &&
    (xml.match(/<trkseg>/g) || []).length === 2 && (xml.match(/<trkpt /g) || []).length === 4)
  check('gpx 名称转义', xml.includes('&quot;') && xml.includes('&lt;test&gt;') && xml.includes('&amp;'))
  check('gpx 坐标为 WGS84', xml.includes(wgs.latitude.toFixed(6)))
}

// ---- quotes ----
{
  const quotes = U('quotes')
  check('quotes 数量充足', quotes.QUOTES.length >= 10)
  check('quotes.pick 确定性', quotes.pick(7) === quotes.pick(7) && quotes.QUOTES.includes(quotes.pick(123456789)))
  check('quotes.pick 越界安全', typeof quotes.pick(-3) === 'string' && typeof quotes.pick(0) === 'string')
}

// ---- poster：mock ctx 验证绘制不抛错且轨迹落在画布内 ----
{
  const poster = U('poster')
  const drawn = []
  const rects = []
  const mockCtx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (prop === 'moveTo' || prop === 'lineTo') return (x, y) => drawn.push([x, y])
      if (prop === 'fillRect') return (x, y) => rects.push([x, y])
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
  check('poster 关键主题齐全', ['sand', 'dopamine', 'vaporwave', 'pixel', 'guochao',
    'rainbow', 'glitch', 'crayon', 'sakura', 'cream', 'sunset', 'aurora', 'ink', 'blackgold', 'morandi', 'custom']
    .every(k => themes.some(t => t.key === k)))
  check('poster 主题数量 ≥20', themes.length >= 20, 'got ' + themes.length)

  // 分类：每个主题恰好属于一个分类
  const cats = poster.categories()
  const catThemes = cats.flatMap(c => c.themes.map(t => t.key))
  check('poster 分类覆盖全部主题且不重复',
    catThemes.length === themes.length && new Set(catThemes).size === catThemes.length &&
    themes.every(t => catThemes.includes(t.key)),
    `cat=${catThemes.length} themes=${themes.length}`)
  check('poster categoryOf', poster.categoryOf('sakura') === 'cute' && poster.categoryOf('custom') === 'custom')

  // 照片主题：带图（cover 裁剪 + 暗化层）与不带图（兜底渐变）都不抛错
  let customOk = true
  try {
    poster.drawPoster(mockCtx, 750, 1334, {
      segments, text: 'L', distanceKm: '1.1', durationText: '5:00',
      speedText: '13.0', dateText: '2026.06.11', quote: 'q',
      bgImage: { width: 1200, height: 900 }
    }, 'custom')
  } catch (e) { customOk = false; console.error(e) }
  check('poster 照片主题带图绘制不抛错', customOk)
  for (const t of themes) {
    drawn.length = 0
    rects.length = 0
    let threw = false
    try {
      poster.drawPoster(mockCtx, 750, 1334, {
        segments, text: 'L', distanceKm: '1.1',
        durationText: '5:00', speedText: '13.0', dateText: '2026.06.11',
        quote: '没有白骑的路，每一公里都算数'
      }, t.key)
    } catch (e) { threw = true; console.error(e) }
    check(`poster [${t.key}] 绘制不抛错`, !threw)
    // 像素主题轨迹走 fillRect，其余走 moveTo/lineTo
    const isPixel = poster.THEMES[t.key].trackStyle === 'pixel'
    if (isPixel) {
      // 背景 1 个 + 纹理若干 + 轨迹方块（含投影两遍）→ 显著多于纹理本身
      check(`poster [${t.key}] 像素轨迹有方块`, rects.length > 250, 'got ' + rects.length)
      check(`poster [${t.key}] 方块原点在画布内`,
        rects.every(([x, y]) => x >= -5 && x <= 755 && y >= -5 && y <= 1339))
    } else {
      check(`poster [${t.key}] 轨迹点都在画布内`,
        drawn.length > 0 && drawn.every(([x, y]) => x >= 0 && x <= 750 && y >= 0 && y <= 1334))
    }
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
