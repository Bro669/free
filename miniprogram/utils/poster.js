// 轨迹海报绘制：主题驱动，传入 canvas 2d ctx 与逻辑尺寸，纯绘制逻辑不依赖 wx API。
// 每个主题定义：
//   bg        多停靠点背景渐变
//   texture   可选程序化纹理（沙粒/星空/彩纸屑/扫描线/极光/花瓣…）
//   passes    多遍轨迹描边（color/width/dx/dy，错位可做立体、RGB 分离等效果）
//   trackStyle 可选特殊轨迹画法：'pixel' 8-bit 方块 | 'hand' 手绘抖动 | 'rainbow' 彩虹分段
//   seal      可选印章（水墨主题）
//   以及文字配色（title/textMain/accent/sub/faint/divider/footer）
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
    title: 'rgba(255,255,255,0.55)', textMain: '#FFFFFF', accent: '#2BE08F',
    sub: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.15)', footer: 'rgba(255,255,255,0.35)',
    passes: [
      { color: 'rgba(25,195,125,0.35)', width: 22 },
      { color: '#2BE08F', width: 10 }
    ]
  },
  dopamine: {
    name: '多巴胺',
    bg: ['#FF5DA2', '#FF8A3D', '#FFD93D'],
    texture: 'confetti',
    title: 'rgba(255,255,255,0.85)', textMain: '#FFFFFF', accent: '#FFFFFF',
    sub: 'rgba(255,255,255,0.8)', faint: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.4)', footer: 'rgba(255,255,255,0.6)',
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
    title: 'rgba(125,249,255,0.7)', textMain: '#FFFFFF', accent: '#7DF9FF',
    sub: 'rgba(255,255,255,0.6)', faint: 'rgba(255,255,255,0.5)',
    divider: 'rgba(125,249,255,0.25)', footer: 'rgba(255,255,255,0.35)',
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
    title: 'rgba(255,255,255,0.6)', textMain: '#FFFFFF', accent: '#00E436',
    sub: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.18)', footer: 'rgba(255,255,255,0.35)',
    passes: []
  },
  rainbow: {
    name: '彩虹',
    bg: ['#15161F', '#23263A'],
    trackStyle: 'rainbow',
    rainbow: {
      glow: 'rgba(255,255,255,0.25)',
      palette: ['#FF4757', '#FFA502', '#FFDD59', '#2ED573', '#1E90FF', '#A55EEA'],
      chunk: 38
    },
    title: 'rgba(255,255,255,0.6)', textMain: '#FFFFFF', accent: '#FFDD59',
    sub: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.18)', footer: 'rgba(255,255,255,0.35)',
    passes: []
  },
  glitch: {
    name: '故障',
    bg: ['#0A0A12', '#16131F'],
    texture: 'glitchbars',
    title: 'rgba(255,255,255,0.6)', textMain: '#FFFFFF', accent: '#00FFF0',
    sub: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(0,255,240,0.25)', footer: 'rgba(255,255,255,0.3)',
    // RGB 通道分离
    passes: [
      { color: 'rgba(0,255,240,0.8)', width: 9, dx: -4 },
      { color: 'rgba(255,0,90,0.8)', width: 9, dx: 4 },
      { color: '#FFFFFF', width: 6 }
    ]
  },
  crayon: {
    name: '蜡笔',
    bg: ['#FFF9EC', '#FFEFD8'],
    texture: 'paper',
    trackStyle: 'hand',
    hand: {
      jitter: 3,
      passes: [
        { color: 'rgba(255,107,107,0.85)', width: 11 },
        { color: 'rgba(255,217,61,0.8)', width: 5, dx: 2, dy: -2 }
      ]
    },
    title: 'rgba(91,70,54,0.6)', textMain: '#5B4636', accent: '#FF6B6B',
    sub: 'rgba(91,70,54,0.6)', faint: 'rgba(91,70,54,0.5)',
    divider: 'rgba(91,70,54,0.2)', footer: 'rgba(91,70,54,0.4)',
    passes: []
  },
  sakura: {
    name: '樱花',
    bg: ['#FFE9F0', '#FFD3E0', '#FBE3F1'],
    texture: 'petals',
    title: 'rgba(161,74,102,0.75)', textMain: '#A14A66', accent: '#E75480',
    sub: 'rgba(161,74,102,0.7)', faint: 'rgba(161,74,102,0.55)',
    divider: 'rgba(231,84,128,0.25)', footer: 'rgba(161,74,102,0.45)',
    passes: [
      { color: 'rgba(255,255,255,0.75)', width: 20 },
      { color: '#E75480', width: 9 }
    ]
  },
  cream: {
    name: '奶油',
    bg: ['#FFF6E9', '#FFE8D6'],
    texture: 'bokeh',
    title: 'rgba(138,90,68,0.65)', textMain: '#8A5A44', accent: '#F77698',
    sub: 'rgba(138,90,68,0.65)', faint: 'rgba(138,90,68,0.5)',
    divider: 'rgba(138,90,68,0.18)', footer: 'rgba(138,90,68,0.4)',
    passes: [
      { color: 'rgba(255,143,170,0.35)', width: 24 },
      { color: '#F77698', width: 10 }
    ]
  },
  sunset: {
    name: '日落',
    bg: ['#2D1B4E', '#B83A5E', '#FF8C42', '#FFD89C'],
    texture: 'stars',
    title: 'rgba(255,232,200,0.75)', textMain: '#FFF4E3', accent: '#FFD89C',
    sub: 'rgba(255,232,200,0.7)', faint: 'rgba(255,232,200,0.55)',
    divider: 'rgba(255,216,156,0.3)', footer: 'rgba(255,232,200,0.45)',
    passes: [
      { color: 'rgba(255,216,156,0.35)', width: 24 },
      { color: '#FFF1D6', width: 9 }
    ]
  },
  aurora: {
    name: '极光',
    bg: ['#04101E', '#0A2238'],
    texture: 'aurora',
    title: 'rgba(180,255,225,0.6)', textMain: '#EAFFF6', accent: '#7CFFC4',
    sub: 'rgba(234,255,246,0.6)', faint: 'rgba(234,255,246,0.45)',
    divider: 'rgba(124,255,196,0.2)', footer: 'rgba(234,255,246,0.35)',
    passes: [
      { color: 'rgba(80,255,190,0.3)', width: 26 },
      { color: '#9FFFDC', width: 9 }
    ]
  },
  acid: {
    name: '酸性',
    bg: ['#0B0B0B', '#16240E'],
    texture: 'grain',
    title: 'rgba(57,255,20,0.7)', textMain: '#E8FFE0', accent: '#39FF14',
    sub: 'rgba(232,255,224,0.6)', faint: 'rgba(232,255,224,0.45)',
    divider: 'rgba(57,255,20,0.25)', footer: 'rgba(232,255,224,0.35)',
    passes: [
      { color: 'rgba(57,255,20,0.22)', width: 32 },
      { color: 'rgba(255,255,255,0.5)', width: 13, dx: -2.5, dy: -2.5 },
      { color: '#39FF14', width: 9 }
    ]
  },
  neon: {
    name: '霓虹',
    bg: ['#070B26', '#1B0F3B'],
    texture: 'stars',
    title: 'rgba(255,255,255,0.5)', textMain: '#FFFFFF', accent: '#00F0C8',
    sub: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.15)', footer: 'rgba(255,255,255,0.3)',
    passes: [
      { color: 'rgba(255,0,200,0.22)', width: 30 },
      { color: 'rgba(0,240,200,0.35)', width: 18 },
      { color: '#8DFFEF', width: 8 }
    ]
  },
  guochao: {
    name: '国潮',
    bg: ['#7E1212', '#A8201A', '#8E1616'],
    texture: 'sparkle',
    title: 'rgba(255,243,221,0.75)', textMain: '#FFF3DD', accent: '#FFD166',
    sub: 'rgba(255,243,221,0.7)', faint: 'rgba(255,243,221,0.55)',
    divider: 'rgba(255,209,102,0.3)', footer: 'rgba(255,243,221,0.45)',
    passes: [
      { color: 'rgba(255,209,102,0.3)', width: 26 },
      { color: 'rgba(94,18,12,0.6)', width: 14, dx: 2.5, dy: 2.5 },
      { color: '#FFD166', width: 10 }
    ]
  },
  ink: {
    name: '水墨',
    bg: ['#F7F3E8', '#EFE6D2'],
    texture: 'ricepaper',
    seal: true,
    title: 'rgba(43,43,43,0.6)', textMain: '#2B2B2B', accent: '#B03A2E',
    sub: 'rgba(43,43,43,0.6)', faint: 'rgba(43,43,43,0.45)',
    divider: 'rgba(43,43,43,0.15)', footer: 'rgba(43,43,43,0.35)',
    // 墨色晕染：淡墨散开 → 中墨 → 浓墨
    passes: [
      { color: 'rgba(70,70,70,0.15)', width: 32 },
      { color: 'rgba(50,50,50,0.4)', width: 17 },
      { color: '#2B2B2B', width: 9 }
    ]
  },
  blackgold: {
    name: '黑金',
    bg: ['#0B0B0D', '#1A1714'],
    texture: 'sparkle',
    title: 'rgba(242,230,201,0.6)', textMain: '#F2E6C9', accent: '#D4AF37',
    sub: 'rgba(242,230,201,0.6)', faint: 'rgba(242,230,201,0.45)',
    divider: 'rgba(212,175,55,0.3)', footer: 'rgba(242,230,201,0.35)',
    passes: [
      { color: 'rgba(212,175,55,0.28)', width: 26 },
      { color: 'rgba(0,0,0,0.6)', width: 13, dx: 2.5, dy: 2.5 },
      { color: '#D4AF37', width: 9 }
    ]
  },
  morandi: {
    name: '莫兰迪',
    bg: ['#DDD5CA', '#CBC1B3'],
    title: 'rgba(84,79,71,0.6)', textMain: '#544F47', accent: '#6E8377',
    sub: 'rgba(84,79,71,0.6)', faint: 'rgba(84,79,71,0.45)',
    divider: 'rgba(84,79,71,0.15)', footer: 'rgba(84,79,71,0.35)',
    passes: [
      { color: 'rgba(110,131,119,0.3)', width: 22 },
      { color: '#6E8377', width: 9 }
    ]
  },
  sand: {
    name: '沙画',
    bg: ['#EBDAB8', '#D7BC8F'],
    texture: 'sand',
    title: 'rgba(90,62,30,0.65)', textMain: '#5A3E1E', accent: '#7A5226',
    sub: 'rgba(90,62,30,0.65)', faint: 'rgba(90,62,30,0.5)',
    divider: 'rgba(90,62,30,0.22)', footer: 'rgba(90,62,30,0.4)',
    // 沙槽效果：柔和散开 → 高光上沿 → 深色凹痕主线（错位制造立体感）
    passes: [
      { color: 'rgba(122,82,38,0.3)', width: 34 },
      { color: 'rgba(255,248,225,0.95)', width: 16, dx: -3.5, dy: -3.5 },
      { color: '#5E3F1B', width: 12, dx: 2, dy: 2 }
    ]
  },
  blueprint: {
    name: '蓝图',
    bg: ['#0E3A6E', '#0B2C53'],
    texture: 'grid',
    title: 'rgba(255,255,255,0.55)', textMain: '#FFFFFF', accent: '#9FD0FF',
    sub: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.2)', footer: 'rgba(255,255,255,0.35)',
    passes: [
      { color: 'rgba(255,255,255,0.3)', width: 16 },
      { color: '#FFFFFF', width: 7 }
    ]
  },
  minimal: {
    name: '极简',
    bg: ['#FFFFFF', '#F2F2EE'],
    title: 'rgba(30,39,34,0.45)', textMain: '#1E2722', accent: '#19C37D',
    sub: 'rgba(30,39,34,0.5)', faint: 'rgba(30,39,34,0.45)',
    divider: 'rgba(30,39,34,0.12)', footer: 'rgba(30,39,34,0.3)',
    passes: [
      { color: 'rgba(30,39,34,0.1)', width: 18 },
      { color: '#1E2722', width: 8 }
    ]
  },
  custom: {
    name: '我的照片',
    customPhoto: true,
    bg: ['#1A2520', '#0E1714'],     // 未选图时的兜底底色
    title: 'rgba(255,255,255,0.75)', textMain: '#FFFFFF', accent: '#FFFFFF',
    sub: 'rgba(255,255,255,0.7)', faint: 'rgba(255,255,255,0.6)',
    divider: 'rgba(255,255,255,0.3)', footer: 'rgba(255,255,255,0.5)',
    // 照片上保证可见：黑色投影 + 白色辉光 + 白色主线
    passes: [
      { color: 'rgba(0,0,0,0.4)', width: 16, dx: 2.5, dy: 2.5 },
      { color: 'rgba(255,255,255,0.45)', width: 24 },
      { color: '#FFFFFF', width: 10 }
    ]
  }
}

// 主题分类（成果页按类切换）
const CATEGORIES = [
  { key: 'trend', name: '潮流', themes: ['dopamine', 'vaporwave', 'pixel', 'rainbow', 'glitch', 'acid', 'neon'] },
  { key: 'cute', name: '可爱', themes: ['sakura', 'cream', 'crayon'] },
  { key: 'nature', name: '风景', themes: ['sunset', 'aurora', 'sand'] },
  { key: 'culture', name: '东方', themes: ['guochao', 'ink', 'blackgold'] },
  { key: 'simple', name: '简约', themes: ['classic', 'minimal', 'morandi', 'blueprint'] },
  { key: 'custom', name: '自定义', themes: ['custom'] }
]

function themeList() {
  return Object.keys(THEMES).map(key => ({ key, name: THEMES[key].name }))
}

function categories() {
  return CATEGORIES.map(c => ({
    key: c.key,
    name: c.name,
    themes: c.themes.map(k => ({ key: k, name: THEMES[k].name }))
  }))
}

function categoryOf(themeKey) {
  const c = CATEGORIES.find(c => c.themes.includes(themeKey))
  return c ? c.key : CATEGORIES[0].key
}

// ===== 程序化纹理 =====
function textureSand(ctx, w, h, rand) {
  for (let i = 0; i < 3600; i++) {
    const x = rand() * w, y = rand() * h
    const r = 0.8 + rand() * 1.8
    const a = 0.08 + rand() * 0.16
    ctx.fillStyle = rand() < 0.5 ? `rgba(104,74,38,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(x, y, r, r)
  }
}

function textureStars(ctx, w, h, rand) {
  for (let i = 0; i < 220; i++) {
    const a = 0.25 + rand() * 0.6
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2)
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

// 多巴胺彩纸屑
function textureConfetti(ctx, w, h, rand) {
  const palette = ['#FFFFFF', '#5DE1FF', '#B6FF5D', '#FFE16B', '#FF8FF0', '#7C6BFF']
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)]
    ctx.globalAlpha = 0.3 + rand() * 0.5
    ctx.fillRect(rand() * w, rand() * h, 5 + rand() * 12, 5 + rand() * 12)
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

// 酸性噪点
function textureGrain(ctx, w, h, rand) {
  for (let i = 0; i < 3000; i++) {
    const a = 0.04 + rand() * 0.12
    ctx.fillStyle = rand() < 0.35 ? `rgba(57,255,20,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand(), 1 + rand())
  }
}

// 金粉（国潮/黑金共用）
function textureSparkle(ctx, w, h, rand) {
  for (let i = 0; i < 320; i++) {
    const a = 0.12 + rand() * 0.35
    ctx.fillStyle = `rgba(255,215,128,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2.4, 1 + rand() * 2.4)
  }
}

// 故障横条 + RGB 细条
function textureGlitchbars(ctx, w, h, rand) {
  for (let i = 0; i < 14; i++) {
    const a = 0.04 + rand() * 0.08
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(0, rand() * h, w, 4 + rand() * 24)
  }
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,255,240,0.15)' : 'rgba(255,0,90,0.15)'
    ctx.fillRect(0, rand() * h, w, 2 + rand() * 4)
  }
}

// 蜡笔纸纹
function texturePaper(ctx, w, h, rand) {
  for (let i = 0; i < 1600; i++) {
    const a = 0.03 + rand() * 0.06
    ctx.fillStyle = `rgba(150,120,90,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5)
  }
}

// 宣纸（水墨）
function textureRicepaper(ctx, w, h, rand) {
  for (let i = 0; i < 1800; i++) {
    const a = 0.025 + rand() * 0.06
    ctx.fillStyle = `rgba(120,100,70,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2)
  }
}

// 樱花花瓣
function texturePetals(ctx, w, h, rand) {
  const colors = ['#FFB7C5', '#FF9FB2', '#FFFFFF', '#F892B0']
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.globalAlpha = 0.35 + rand() * 0.45
    const s = 4 + rand() * 8
    ctx.fillRect(rand() * w, rand() * h, s, s * (0.6 + rand() * 0.5))
  }
  ctx.globalAlpha = 1
}

// 奶油光斑（柔和大圆）
function textureBokeh(ctx, w, h, rand) {
  const colors = ['rgba(255,182,193,1)', 'rgba(189,236,222,1)', 'rgba(221,205,255,1)', 'rgba(255,236,179,1)']
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.globalAlpha = 0.08 + rand() * 0.1
    ctx.beginPath()
    ctx.arc(rand() * w, rand() * h, 24 + rand() * 70, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// 极光光带 + 星空
function textureAurora(ctx, w, h, rand) {
  const bands = [
    { color: 'rgba(80,255,190,0.14)', width: 120 },
    { color: 'rgba(120,200,255,0.12)', width: 100 },
    { color: 'rgba(190,120,255,0.1)', width: 90 }
  ]
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  bands.forEach((b, k) => {
    ctx.strokeStyle = b.color
    ctx.lineWidth = b.width
    ctx.beginPath()
    const baseY = h * (0.1 + 0.12 * k)
    for (let i = 0; i <= 6; i++) {
      const x = (w / 6) * i
      const y = baseY + Math.sin(i * 1.3 + k) * h * 0.045 + rand() * h * 0.02
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  })
  for (let i = 0; i < 160; i++) {
    const a = 0.2 + rand() * 0.5
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.8, 1 + rand() * 1.8)
  }
}

const TEXTURES = {
  sand: textureSand,
  stars: textureStars,
  grid: textureGrid,
  confetti: textureConfetti,
  scanlines: textureScanlines,
  grain: textureGrain,
  sparkle: textureSparkle,
  glitchbars: textureGlitchbars,
  paper: texturePaper,
  ricepaper: textureRicepaper,
  petals: texturePetals,
  bokeh: textureBokeh,
  aurora: textureAurora
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

// 画布坐标折线按 step 像素加密（手绘抖动/彩虹分段需要均匀点距）
function densify(seg, step) {
  if (seg.length < 2) return seg.slice()
  const out = [seg[0]]
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1], b = seg[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(d / step))
    for (let t = 1; t <= n; t++) {
      out.push({ x: a.x + (b.x - a.x) * t / n, y: a.y + (b.y - a.y) * t / n })
    }
  }
  return out
}

// 标准多遍描边
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

// 手绘画法：加密后逐点随机抖动，多遍异色叠加出蜡笔/马克笔质感
function drawTrackHand(ctx, segments, box, style, rand) {
  const fitted = fitTrack(segments, box)
  if (!fitted) return
  const jitter = style.jitter || 3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const pass of style.passes) {
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.width
    const dx = pass.dx || 0
    const dy = pass.dy || 0
    for (const seg of fitted) {
      if (seg.length < 2) continue
      const dense = densify(seg, 14)
      ctx.beginPath()
      dense.forEach((p, i) => {
        const x = p.x + dx + (rand() * 2 - 1) * jitter
        const y = p.y + dy + (rand() * 2 - 1) * jitter
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }
}

// 彩虹画法：白色底光 + 沿线等长分段循环上色
function drawTrackRainbow(ctx, segments, box, style) {
  const fitted = fitTrack(segments, box)
  if (!fitted) return
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // 底光
  ctx.strokeStyle = style.glow
  ctx.lineWidth = 18
  for (const seg of fitted) {
    if (seg.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(seg[0].x, seg[0].y)
    for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y)
    ctx.stroke()
  }
  // 分段彩虹
  const palette = style.palette
  const chunkLen = style.chunk || 38
  ctx.lineWidth = 9
  let ci = 0
  for (const seg of fitted) {
    if (seg.length < 2) continue
    const dense = densify(seg, 8)
    let acc = 0
    let chunk = [dense[0]]
    for (let i = 1; i < dense.length; i++) {
      chunk.push(dense[i])
      acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y)
      if (acc >= chunkLen || i === dense.length - 1) {
        ctx.strokeStyle = palette[ci % palette.length]
        ctx.beginPath()
        ctx.moveTo(chunk[0].x, chunk[0].y)
        for (let k = 1; k < chunk.length; k++) ctx.lineTo(chunk[k].x, chunk[k].y)
        ctx.stroke()
        ci++
        acc = 0
        chunk = [dense[i]]
      }
    }
  }
}

// 水墨印章
function drawSeal(ctx, w, h, theme) {
  const s = w * 0.075
  const x = w * 0.84
  const y = h * 0.595
  ctx.fillStyle = theme.accent
  ctx.fillRect(x, y, s, s)
  ctx.fillStyle = '#F7F3E8'
  ctx.font = `bold ${Math.round(s * 0.62)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('骑', x + s / 2, y + s * 0.72)
}

// data: { segments, text, distanceKm, durationText, speedText, dateText, quote }
// w/h 为逻辑像素（调用方负责 ctx.scale(dpr)），themeKey 见 THEMES
function drawPoster(ctx, w, h, data, themeKey) {
  const theme = THEMES[themeKey] || THEMES.classic
  const first = data.segments[0] && data.segments[0][0]
  const seed = first ? Math.round((first.latitude + first.longitude) * 1e6) : 42

  // 背景：照片主题用用户图片 cover 裁剪铺满 + 暗化渐变保证可读性；
  // 其余主题（或照片缺失时兜底）画多停靠点渐变 + 纹理
  if (theme.customPhoto && data.bgImage && data.bgImage.width) {
    const iw = data.bgImage.width
    const ih = data.bgImage.height
    const scale = Math.max(w / iw, h / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.drawImage(data.bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh)
    const ov = ctx.createLinearGradient(0, 0, 0, h)
    ov.addColorStop(0, 'rgba(8,12,10,0.55)')
    ov.addColorStop(0.45, 'rgba(8,12,10,0.22)')
    ov.addColorStop(1, 'rgba(8,12,10,0.68)')
    ctx.fillStyle = ov
    ctx.fillRect(0, 0, w, h)
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    theme.bg.forEach((c, i) => {
      bg.addColorStop(theme.bg.length === 1 ? 0 : i / (theme.bg.length - 1), c)
    })
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // 纹理（用轨迹首点做随机种子，同一轨迹纹理稳定）
    if (theme.texture && TEXTURES[theme.texture]) {
      TEXTURES[theme.texture](ctx, w, h, lcg(seed))
    }
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
  } else if (theme.trackStyle === 'hand') {
    drawTrackHand(ctx, data.segments, box, theme.hand, lcg(seed + 7))
  } else if (theme.trackStyle === 'rainbow') {
    drawTrackRainbow(ctx, data.segments, box, theme.rainbow)
  } else {
    drawTrack(ctx, data.segments, box, theme.passes)
  }
  if (theme.seal) drawSeal(ctx, w, h, theme)

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

module.exports = { drawPoster, drawTrack, themeList, categories, categoryOf, THEMES }
