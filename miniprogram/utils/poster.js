// 轨迹海报绘制：主题驱动，传入 canvas 2d ctx 与逻辑尺寸，纯绘制逻辑不依赖 wx API。
// 每个主题定义背景渐变（支持多停靠点）、可选程序化纹理、轨迹画法
// （多遍描边可带偏移做立体效果；或 trackStyle:'pixel' 渲染成像素块）与文字配色。
const geo = require('./geo')

// 确定性伪随机（LCG），保证同一轨迹每次生成的纹理一致
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const THEMES = {
  classic: {
    name: '经典',
    bg: ['#0C1F16', '#16382A'],
    title: 'rgba(255,255,255,0.55)',
    textMain: '#FFFFFF',
    accent: '#2BE08F',
    sub: 'rgba(255,255,255,0.55)',
    faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.15)',
    footer: 'rgba(255,255,255,0.35)',
    passes: [
      { color: 'rgba(25,195,125,0.35)', width: 22 },
      { color: '#2BE08F', width: 10 }
    ]
  },
  dopamine: {
    name: '多巴胺',
    bg: ['#FF5DA2', '#FF8A3D', '#FFD93D'],
    texture: 'confetti',
    title: 'rgba(255,255,255,0.85)',
    textMain: '#FFFFFF',
    accent: '#FFFFFF',
    sub: 'rgba(255,255,255,0.8)',
    faint: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.4)',
    footer: 'rgba(255,255,255,0.6)',
    passes: [
      { color: 'rgba(255,255,255,0.45)', width: 26 },
      { color: 'rgba(94,53,177,0.55)', width: 14, dx: 3, dy: 3 },
      { color: '#FFFFFF', width: 11 }
    ]
  },
  vaporwave: {
    name: '蒸汽波',
    bg: ['#1B0B45', '#7B2FA0', '#FF6EC7'],
    texture: 'scanlines',
    title: 'rgba(125,249,255,0.7)',
    textMain: '#FFFFFF',
    accent: '#7DF9FF',
    sub: 'rgba(255,255,255,0.6)',
    faint: 'rgba(255,255,255,0.5)',
    divider: 'rgba(125,249,255,0.25)',
    footer: 'rgba(255,255,255,0.35)',
    passes: [
      { color: 'rgba(255,110,199,0.4)', width: 28 },
      { color: 'rgba(125,249,255,0.35)', width: 16 },
      { color: '#9FFCFF', width: 8 }
    ]
  },
  pixel: {
    name: '像素',
    bg: ['#1B1036', '#2D1B5A'],
    texture: 'stars',
    trackStyle: 'pixel',
    pixel: { shadow: 'rgba(0,0,0,0.45)', main: '#00E436', cells: 56 },
    title: 'rgba(255,255,255,0.6)',
    textMain: '#FFFFFF',
    accent: '#00E436',
    sub: 'rgba(255,255,255,0.55)',
    faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.18)',
    footer: 'rgba(255,255,255,0.35)',
    passes: []
  },
  acid: {
    name: '酸性',
    bg: ['#0B0B0B', '#16240E'],
    texture: 'grain',
    title: 'rgba(57,255,20,0.7)',
    textMain: '#E8FFE0',
    accent: '#39FF14',
    sub: 'rgba(232,255,224,0.6)',
    faint: 'rgba(232,255,224,0.45)',
    divider: 'rgba(57,255,20,0.25)',
    footer: 'rgba(232,255,224,0.35)',
    passes: [
      { color: 'rgba(57,255,20,0.22)', width: 32 },
      { color: 'rgba(255,255,255,0.5)', width: 13, dx: -2.5, dy: -2.5 },
      { color: '#39FF14', width: 9 }
    ]
  },
  guochao: {
    name: '国潮',
    bg: ['#7E1212', '#A8201A', '#8E1616'],
    texture: 'sparkle',
    title: 'rgba(255,243,221,0.75)',
    textMain: '#FFF3DD',
    accent: '#FFD166',
    sub: 'rgba(255,243,221,0.7)',
    faint: 'rgba(255,243,221,0.55)',
    divider: 'rgba(255,209,102,0.3)',
    footer: 'rgba(255,243,221,0.45)',
    passes: [
      { color: 'rgba(255,209,102,0.3)', width: 26 },
      { color: 'rgba(94,18,12,0.6)', width: 14, dx: 2.5, dy: 2.5 },
      { color: '#FFD166', width: 10 }
    ]
  },
  sand: {
    name: '沙画',
    bg: ['#EBDAB8', '#D7BC8F'],
    texture: 'sand',
    title: 'rgba(90,62,30,0.65)',
    textMain: '#5A3E1E',
    accent: '#7A5226',
    sub: 'rgba(90,62,30,0.65)',
    faint: 'rgba(90,62,30,0.5)',
    divider: 'rgba(90,62,30,0.22)',
    footer: 'rgba(90,62,30,0.4)',
    // 沙槽效果：柔和散开 → 高光上沿 → 深色凹痕主线（错位制造立体感）
    passes: [
      { color: 'rgba(122,82,38,0.3)', width: 34 },
      { color: 'rgba(255,248,225,0.95)', width: 16, dx: -3.5, dy: -3.5 },
      { color: '#5E3F1B', width: 12, dx: 2, dy: 2 }
    ]
  },
  neon: {
    name: '霓虹',
    bg: ['#070B26', '#1B0F3B'],
    texture: 'stars',
    title: 'rgba(255,255,255,0.5)',
    textMain: '#FFFFFF',
    accent: '#00F0C8',
    sub: 'rgba(255,255,255,0.5)',
    faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.15)',
    footer: 'rgba(255,255,255,0.3)',
    passes: [
      { color: 'rgba(255,0,200,0.22)', width: 30 },
      { color: 'rgba(0,240,200,0.35)', width: 18 },
      { color: '#8DFFEF', width: 8 }
    ]
  },
  blueprint: {
    name: '蓝图',
    bg: ['#0E3A6E', '#0B2C53'],
    texture: 'grid',
    title: 'rgba(255,255,255,0.55)',
    textMain: '#FFFFFF',
    accent: '#9FD0FF',
    sub: 'rgba(255,255,255,0.55)',
    faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.2)',
    footer: 'rgba(255,255,255,0.35)',
    passes: [
      { color: 'rgba(255,255,255,0.3)', width: 16 },
      { color: '#FFFFFF', width: 7 }
    ]
  },
  minimal: {
    name: '极简',
    bg: ['#FFFFFF', '#F2F2EE'],
    title: 'rgba(30,39,34,0.45)',
    textMain: '#1E2722',
    accent: '#19C37D',
    sub: 'rgba(30,39,34,0.5)',
    faint: 'rgba(30,39,34,0.45)',
    divider: 'rgba(30,39,34,0.12)',
    footer: 'rgba(30,39,34,0.3)',
    passes: [
      { color: 'rgba(30,39,34,0.1)', width: 18 },
      { color: '#1E2722', width: 8 }
    ]
  }
}

function themeList() {
  return Object.keys(THEMES).map(key => ({ key, name: THEMES[key].name }))
}

// ===== 程序化纹理 =====
function textureSand(ctx, w, h, rand) {
  // 沙粒：深浅两色细点铺满画面
  for (let i = 0; i < 3600; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 0.8 + rand() * 1.8
    const dark = rand() < 0.5
    const a = 0.08 + rand() * 0.16
    ctx.fillStyle = dark ? `rgba(104,74,38,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(x, y, r, r)
  }
}

function textureStars(ctx, w, h, rand) {
  for (let i = 0; i < 220; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 1 + rand() * 2
    const a = 0.25 + rand() * 0.6
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(x, y, r, r)
  }
}

function textureGrid(ctx, w, h) {
  const step = w / 12
  ctx.lineWidth = 1
  for (let i = 0; i * step <= w + 1; i++) {
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, h)
    ctx.stroke()
  }
  for (let j = 0; j * step <= h + 1; j++) {
    ctx.strokeStyle = j % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.moveTo(0, j * step)
    ctx.lineTo(w, j * step)
    ctx.stroke()
  }
}

// 多巴胺彩纸屑：糖果色方块漫天撒
function textureConfetti(ctx, w, h, rand) {
  const palette = ['#FFFFFF', '#5DE1FF', '#B6FF5D', '#FFE16B', '#FF8FF0', '#7C6BFF']
  for (let i = 0; i < 110; i++) {
    const x = rand() * w
    const y = rand() * h
    const s = 5 + rand() * 12
    const a = 0.3 + rand() * 0.5
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)]
    ctx.globalAlpha = a
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 1
}

// 蒸汽波 CRT 扫描线 + 远处星点
function textureScanlines(ctx, w, h, rand) {
  ctx.fillStyle = 'rgba(255,255,255,0.045)'
  for (let y = 0; y < h; y += 9) ctx.fillRect(0, y, w, 1.4)
  for (let i = 0; i < 90; i++) {
    const a = 0.2 + rand() * 0.5
    ctx.fillStyle = `rgba(125,249,255,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h * 0.5, 1.5, 1.5)
  }
}

// 酸性噪点：荧光绿/白高频颗粒
function textureGrain(ctx, w, h, rand) {
  for (let i = 0; i < 3000; i++) {
    const x = rand() * w
    const y = rand() * h
    const a = 0.04 + rand() * 0.12
    ctx.fillStyle = rand() < 0.35 ? `rgba(57,255,20,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(x, y, 1 + rand(), 1 + rand())
  }
}

// 国潮金粉
function textureSparkle(ctx, w, h, rand) {
  for (let i = 0; i < 320; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 1 + rand() * 2.4
    const a = 0.12 + rand() * 0.35
    ctx.fillStyle = `rgba(255,215,128,${a.toFixed(3)})`
    ctx.fillRect(x, y, r, r)
  }
}

const TEXTURES = {
  sand: textureSand,
  stars: textureStars,
  grid: textureGrid,
  confetti: textureConfetti,
  scanlines: textureScanlines,
  grain: textureGrain,
  sparkle: textureSparkle
}

// ===== 轨迹 =====
// 轨迹自适配：经纬度 → box 内画布坐标（局部米坐标防形变），返回逐段的画布点
function fitTrack(segments, box) {
  const all = segments.flat()
  if (all.length < 2) return null
  const b = geo.bbox(all)
  const origin = {
    latitude: (b.minLat + b.maxLat) / 2,
    longitude: (b.minLng + b.maxLng) / 2
  }
  const local = segments.map(seg => seg.map(p => geo.toLocalMeters(p, origin)))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const seg of local) for (const p of seg) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const pad = 0.1
  const scale = Math.min(box.w * (1 - 2 * pad) / spanX, box.h * (1 - 2 * pad) / spanY)
  const offX = box.x + (box.w - spanX * scale) / 2
  const offY = box.y + (box.h - spanY * scale) / 2
  // y 北朝上 → canvas 向下翻转
  return local.map(seg => seg.map(p => ({
    x: offX + (p.x - minX) * scale,
    y: offY + (maxY - p.y) * scale
  })))
}

// segments: [[{latitude, longitude}...]]，多遍描边画法
function drawTrack(ctx, segments, box, passes) {
  const fitted = fitTrack(segments, box)
  if (!fitted) return
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const pass of passes) {
    const dx = pass.dx || 0
    const dy = pass.dy || 0
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.width
    for (const seg of fitted) {
      if (seg.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(seg[0].x + dx, seg[0].y + dy)
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x + dx, seg[i].y + dy)
      ctx.stroke()
    }
  }
}

// 像素画法：轨迹栅格化成 8-bit 方块（带投影一层）
function drawTrackPixel(ctx, segments, box, style) {
  const fitted = fitTrack(segments, box)
  if (!fitted) return
  const cell = box.w / (style.cells || 56)
  const cells = new Set()
  for (const seg of fitted) {
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.4)))
      for (let t = 0; t <= steps; t++) {
        const x = a.x + (b.x - a.x) * t / steps
        const y = a.y + (b.y - a.y) * t / steps
        cells.add(Math.floor(x / cell) + ',' + Math.floor(y / cell))
      }
    }
  }
  const gap = Math.max(1, cell * 0.12)
  const size = cell - gap
  // 先画投影再画主块
  ctx.fillStyle = style.shadow
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number)
    ctx.fillRect(cx * cell + gap / 2 + cell * 0.25, cy * cell + gap / 2 + cell * 0.25, size, size)
  }
  ctx.fillStyle = style.main
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number)
    ctx.fillRect(cx * cell + gap / 2, cy * cell + gap / 2, size, size)
  }
}

// data: { segments, text, distanceKm, durationText, speedText, dateText, quote }
// w/h 为逻辑像素（调用方负责 ctx.scale(dpr)），themeKey 见 THEMES
function drawPoster(ctx, w, h, data, themeKey) {
  const theme = THEMES[themeKey] || THEMES.classic

  // 背景（支持多停靠点渐变）
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  theme.bg.forEach((c, i) => {
    bg.addColorStop(theme.bg.length === 1 ? 0 : i / (theme.bg.length - 1), c)
  })
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 纹理（用轨迹首点做随机种子，同一轨迹纹理稳定）
  if (theme.texture && TEXTURES[theme.texture]) {
    const first = data.segments[0] && data.segments[0][0]
    const seed = first ? Math.round((first.latitude + first.longitude) * 1e6) : 42
    TEXTURES[theme.texture](ctx, w, h, lcg(seed))
  }

  // 顶部标语
  ctx.fillStyle = theme.title
  ctx.font = `${Math.round(w * 0.032)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('我 在 城 市 里 骑 出 了', w / 2, h * 0.08)

  if (data.text) {
    ctx.fillStyle = theme.textMain
    ctx.font = `bold ${Math.round(w * 0.1)}px sans-serif`
    ctx.fillText(data.text, w / 2, h * 0.155)
  }

  // 轨迹主体
  const box = { x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.42 }
  if (theme.trackStyle === 'pixel') {
    drawTrackPixel(ctx, data.segments, box, theme.pixel)
  } else {
    drawTrack(ctx, data.segments, box, theme.passes)
  }

  // 分隔线
  ctx.strokeStyle = theme.divider
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(w * 0.08, h * 0.68)
  ctx.lineTo(w * 0.92, h * 0.68)
  ctx.stroke()

  // 距离大字
  ctx.fillStyle = theme.accent
  ctx.font = `bold ${Math.round(w * 0.14)}px sans-serif`
  ctx.fillText(data.distanceKm, w / 2, h * 0.78)
  ctx.fillStyle = theme.sub
  ctx.font = `${Math.round(w * 0.03)}px sans-serif`
  ctx.fillText('公里', w / 2, h * 0.812)

  // 数据行
  const stats = [
    [data.durationText, '时长'],
    [data.speedText + ' km/h', '均速'],
    [data.dateText, '日期']
  ]
  stats.forEach(([num, label], i) => {
    const x = w * (0.2 + 0.3 * i)
    ctx.fillStyle = theme.textMain
    ctx.font = `bold ${Math.round(w * 0.042)}px sans-serif`
    ctx.fillText(num, x, h * 0.872)
    ctx.fillStyle = theme.faint
    ctx.font = `${Math.round(w * 0.026)}px sans-serif`
    ctx.fillText(label, x, h * 0.9)
  })

  // 金句
  if (data.quote) {
    ctx.fillStyle = theme.accent
    ctx.font = `${Math.round(w * 0.036)}px sans-serif`
    ctx.fillText('「 ' + data.quote + ' 」', w / 2, h * 0.943)
  }

  // 底部署名
  ctx.fillStyle = theme.footer
  ctx.font = `${Math.round(w * 0.026)}px sans-serif`
  ctx.fillText('骑字 · 在城市里骑出你的名字', w / 2, h * 0.975)
}

module.exports = { drawPoster, drawTrack, themeList, THEMES }
