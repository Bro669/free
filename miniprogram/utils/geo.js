// 地理计算纯函数（无 wx 依赖，可在 node / 开发者工具控制台直接验证）
// 点统一用 { latitude, longitude }，距离单位米。

const EARTH_R = 6371000
const M_PER_DEG_LAT = 111320

function toRad(d) { return d * Math.PI / 180 }

// 两点球面距离（haversine）
function haversine(a, b) {
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

function pathDistance(points) {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i])
  return d
}

function bbox(points) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude
    if (p.latitude > maxLat) maxLat = p.latitude
    if (p.longitude < minLng) minLng = p.longitude
    if (p.longitude > maxLng) maxLng = p.longitude
  }
  return { minLat, maxLat, minLng, maxLng }
}

// 经纬度 → 以 origin 为原点的局部平面米坐标（等距近似，城市尺度足够精确）
// 返回 x 向东、y 向北。海报绘制与 DP 抽稀都基于它，避免经度方向被压扁。
function toLocalMeters(p, origin) {
  const cos = Math.cos(toRad(origin.latitude))
  return {
    x: (p.longitude - origin.longitude) * M_PER_DEG_LAT * cos,
    y: (p.latitude - origin.latitude) * M_PER_DEG_LAT
  }
}

// 点 p 到线段 ab 的垂距（米，局部平面近似）
function perpDistance(p, a, b) {
  const P = toLocalMeters(p, a)
  const B = toLocalMeters(b, a)
  const len2 = B.x * B.x + B.y * B.y
  if (len2 === 0) return Math.sqrt(P.x * P.x + P.y * P.y)
  let t = (P.x * B.x + P.y * B.y) / len2
  t = Math.max(0, Math.min(1, t))
  const dx = P.x - t * B.x
  const dy = P.y - t * B.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Douglas-Peucker 抽稀，tolerance 单位米
function simplify(points, tolerance) {
  if (points.length <= 2) return points.slice()
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = -1, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tolerance) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return points.filter((_, i) => keep[i])
}

// 骑行轨迹点过滤器：精度差/漂移/静止抖动的点不入轨迹。
// 返回 'ok' | 'inaccurate' | 'jump' | 'still'
function classifyTrackPoint(prev, next, opts = {}) {
  const maxAccuracy = opts.maxAccuracy || 30      // m
  const maxSpeed = opts.maxSpeed || 25            // m/s，骑行不可能 90km/h
  const minStep = opts.minStep || 5               // m，小于此视为原地抖动
  if (next.accuracy != null && next.accuracy > maxAccuracy) return 'inaccurate'
  if (!prev) return 'ok'
  const d = haversine(prev, next)
  if (d < minStep) return 'still'
  const dt = (next.timestamp - prev.timestamp) / 1000
  if (dt > 0 && d / dt > maxSpeed) return 'jump'
  return 'ok'
}

// 沿折线按 spacing（米）等距重采样，保留首尾点；用于贴路前生成锚点。
function resample(points, spacing) {
  if (points.length < 2) return points.slice()
  const out = [points[0]]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]
    const b = points[i]
    let segLen = haversine(a, b)
    while (carry + segLen >= spacing) {
      const need = spacing - carry
      const t = need / segLen
      const p = {
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t
      }
      out.push(p)
      a = p
      segLen -= need
      carry = 0
    }
    carry += segLen
  }
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  // 末点距上一锚点过近时用末点替换，避免贴路段过短
  if (haversine(tail, last) < spacing * 0.3 && out.length > 1) out[out.length - 1] = last
  else out.push(last)
  return out
}

module.exports = {
  haversine,
  pathDistance,
  bbox,
  toLocalMeters,
  perpDistance,
  simplify,
  classifyTrackPoint,
  resample
}
