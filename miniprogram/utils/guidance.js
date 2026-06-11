// 沿线导航（纯函数，无 wx 依赖）：
// 字形路线必须按既定走线骑，不能交给外部导航重新规划（会毁掉字形），
// 所以这里实现轻量「沿线引导」：轨迹匹配 + 转向提示 + 偏航检测 + 进度。
//
// 关键点：字母路线经常折返重走同一段路（如 A 的横线、E 的中横），
// 朴素的全局最近点匹配会把进度跳到错误的一段，必须用「进度窗口」匹配：
// 只在上次匹配位置附近向前搜索，大幅偏离时才全局重定位。

const geo = require('./geo')

const TURN_LOOK = 15          // 计算拐点方向的前后取样距离（米）
const TURN_MIN_DEG = 30       // 视为转弯的最小方向变化
const UTURN_DEG = 150         // 视为掉头
const TURN_MERGE = 25         // 相邻拐点聚类距离（米）
const WINDOW_BACK = 10        // 匹配窗口：向后段数
const WINDOW_FWD = 80         // 匹配窗口：向前段数
const OFF_ENTER = 45          // 偏航进入阈值（米）
const OFF_EXIT = 30           // 偏航解除阈值（滞回）
const REACQUIRE = 80          // 窗口内最近距离超过此值时尝试全局重定位
const HEADING_PENALTY = 40    // 候选段方向与骑行航向相反时的罚分（米）
const HEADING_MIN_MOVE = 5    // 计算航向所需的最小位移（米）

function xy(p, origin) { return geo.toLocalMeters(p, origin) }

// sections: [{ points: [{latitude, longitude}...], ride }] 按骑行顺序排列
// 返回 guide = { pts, mode, cum, total, turns, sectionStarts }
//   mode[i]：pts[i]→pts[i+1] 这一段是否骑行段（false=推行衔接）
//   turns：[{ idx, distAlong, deg, dir }]，dir: left|right|uturn
function buildGuide(sections) {
  const pts = []
  const mode = []
  const sectionStarts = []
  for (const sec of sections) {
    const ride = sec.ride !== false
    if (!sec.points || !sec.points.length) continue
    sectionStarts.push({ idx: Math.max(pts.length - 1, 0), ride })
    for (const p of sec.points) {
      const last = pts[pts.length - 1]
      if (last && last.latitude === p.latitude && last.longitude === p.longitude) continue
      if (pts.length) mode.push(ride)
      pts.push(p)
    }
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + geo.haversine(pts[i - 1], pts[i]))
  const total = cum[cum.length - 1] || 0
  return { pts, mode, cum, total, turns: computeTurns(pts, cum, mode), sectionStarts }
}

function pointAtBack(pts, cum, k, dist) {
  let j = k - 1
  while (j > 0 && cum[k] - cum[j] < dist) j--
  return pts[j]
}

function pointAtFwd(pts, cum, k, dist) {
  let j = k + 1
  while (j < pts.length - 1 && cum[j] - cum[k] < dist) j++
  return pts[j]
}

function computeTurns(pts, cum, mode) {
  const cands = []
  for (let k = 1; k < pts.length - 1; k++) {
    if (!mode[k - 1] || !mode[k]) continue        // 推行段不提示转向
    const origin = pts[k]
    const a = xy(pointAtBack(pts, cum, k, TURN_LOOK), origin)
    const b = xy(pointAtFwd(pts, cum, k, TURN_LOOK), origin)
    // v1: 进入方向（a→k 即 -a），v2: 离开方向（k→b 即 b）
    const v1 = { x: -a.x, y: -a.y }
    const v2 = b
    const n1 = Math.hypot(v1.x, v1.y), n2 = Math.hypot(v2.x, v2.y)
    if (n1 < 1 || n2 < 1) continue
    const cross = v1.x * v2.y - v1.y * v2.x
    const dot = v1.x * v2.x + v1.y * v2.y
    const deg = Math.atan2(cross, dot) * 180 / Math.PI   // 正=左转（x 东 y 北）
    if (Math.abs(deg) >= TURN_MIN_DEG) cands.push({ idx: k, distAlong: cum[k], deg })
  }
  // 相邻候选聚类，保留转角最大的
  const turns = []
  for (const c of cands) {
    const last = turns[turns.length - 1]
    if (last && c.distAlong - last.distAlong < TURN_MERGE) {
      if (Math.abs(c.deg) > Math.abs(last.deg)) turns[turns.length - 1] = c
    } else {
      turns.push(c)
    }
  }
  for (const t of turns) {
    t.dir = Math.abs(t.deg) >= UTURN_DEG ? 'uturn' : (t.deg > 0 ? 'left' : 'right')
  }
  return turns
}

// 投影 pos 到 [lo,hi] 段窗口内的最佳匹配。
// 字母路线常沿同一条路折返，去/回两段在几何上重合，仅凭距离无法区分，
// 所以传入骑行航向 heading（局部米向量），与段方向相反的候选加罚分。
function nearestInWindow(guide, pos, lo, hi, heading) {
  let best = { idx: lo, t: 0, dist: Infinity, score: Infinity }
  for (let i = lo; i <= hi; i++) {
    const A = guide.pts[i], B = guide.pts[i + 1]
    const a = xy(A, pos), b = xy(B, pos)   // pos 为原点 → 点到段距离
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : -(a.x * dx + a.y * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx, py = a.y + t * dy
    const dist = Math.hypot(px, py)
    let score = dist
    if (heading && len2 > 0 && heading.x * dx + heading.y * dy < 0) score += HEADING_PENALTY
    if (score < best.score) best = { idx: i, t, dist, score }
  }
  return best
}

// 创建有状态的轨迹匹配器；每个定位点调用 update(pos)。
// 返回 { distAlong, progress, distFromPath, offRoute, ride, nextTurn, finished }
function createTracker(guide) {
  let lastIdx = 0
  let lastPos = null
  let offRoute = false
  return {
    update(pos) {
      const n = guide.pts.length
      if (n < 2) return null
      let heading = null
      if (lastPos && geo.haversine(lastPos, pos) >= HEADING_MIN_MOVE) {
        heading = xy(pos, lastPos)        // lastPos→pos 的局部米向量
      }
      lastPos = pos
      const lo = Math.max(0, lastIdx - WINDOW_BACK)
      const hi = Math.min(n - 2, lastIdx + WINDOW_FWD)
      let best = nearestInWindow(guide, pos, lo, hi, heading)
      if (best.dist > REACQUIRE) {
        const g = nearestInWindow(guide, pos, 0, n - 2, heading)
        if (g.dist < best.dist - 20) best = g
      }
      lastIdx = best.idx
      const segLen = guide.cum[best.idx + 1] - guide.cum[best.idx]
      const distAlong = guide.cum[best.idx] + best.t * segLen
      offRoute = offRoute ? best.dist > OFF_EXIT : best.dist > OFF_ENTER

      let nextTurn = null
      for (const t of guide.turns) {
        if (t.distAlong > distAlong + 5) { nextTurn = { dir: t.dir, deg: t.deg, dist: t.distAlong - distAlong, idx: t.idx }; break }
      }
      return {
        distAlong,
        progress: guide.total > 0 ? distAlong / guide.total : 0,
        distFromPath: best.dist,
        offRoute,
        ride: guide.mode[best.idx] !== false,
        nextTurn,
        finished: guide.total > 0 && guide.total - distAlong < 30
      }
    }
  }
}

module.exports = { buildGuide, createTracker, computeTurns }
