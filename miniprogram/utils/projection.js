// 字形排版 + 字形→经纬度投影（纯函数，无 wx 依赖）

const glyphs = require('./glyphs')

const CHAR_GAP = 0.25       // 字间距（相对字高）
const M_PER_DEG_LAT = 111320

// 校验文本是否全部可渲染，返回不支持的字符数组
function unsupportedChars(text) {
  return [...text.toUpperCase()].filter(c => !glyphs[c])
}

// 把多字符文本排版成统一坐标系下的笔画列表。
// 返回 { strokes: [{ points: [[x,y]...], ride }], width }
// ride:false 的段是自动插入的「推行衔接段」（笔画间/字符间抬笔）。
function layout(text) {
  const chars = [...text.toUpperCase()]
  const strokes = []
  let offsetX = 0
  let prevEnd = null
  for (const c of chars) {
    const g = glyphs[c]
    if (!g) throw new Error('不支持的字符: ' + c)
    for (const s of g.strokes) {
      const pts = s.points.map(([x, y]) => [x + offsetX, y])
      if (prevEnd) strokes.push({ points: [prevEnd, pts[0]], ride: false })
      strokes.push({ points: pts, ride: true })
      prevEnd = pts[pts.length - 1]
    }
    offsetX += g.width + CHAR_GAP
  }
  return { strokes, width: Math.max(offsetX - CHAR_GAP, 0) }
}

// 归一化坐标 → 经纬度。
// center: {latitude, longitude} 字形几何中心；heightMeters: 字高；rotationDeg: 顺时针旋转角。
// 返回与 layout 同结构、points 为 [{latitude, longitude}] 的笔画列表。
function project(layoutResult, { center, heightMeters, rotationDeg = 0 }) {
  const { strokes, width } = layoutResult
  const theta = -rotationDeg * Math.PI / 180   // 地图上顺时针为正 → 数学逆时针取负
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(center.latitude * Math.PI / 180)
  return strokes.map(s => ({
    ride: s.ride !== false,
    points: s.points.map(([u, v]) => {
      // 以字形中心为原点的米坐标，y 翻转（v 向下 → 北为正）
      const x = (u - width / 2) * heightMeters
      const y = (0.5 - v) * heightMeters
      const xr = x * cosT - y * sinT
      const yr = x * sinT + y * cosT
      return {
        latitude: center.latitude + yr / M_PER_DEG_LAT,
        longitude: center.longitude + xr / mPerDegLng
      }
    })
  }))
}

module.exports = { layout, project, unsupportedChars, CHAR_GAP }
