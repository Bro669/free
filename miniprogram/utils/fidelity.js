// 还原度评分（纯函数）：两组折线之间的双向平均偏差 → 0-100 分。
// 用途：
//   设计时——贴路结果 vs 理想字形投影（这个位置的路网能多大程度还原字形）
//   骑行后——实际轨迹 vs 计划路线（骑得像不像）
const geo = require('./geo')

const SAMPLE_M = 40        // 重采样间距
const CAP = 300            // 单侧采样点上限（控制 O(N*M) 成本）

function samplePoints(lines) {
  const pts = []
  for (const line of lines) {
    if (!line || line.length < 2) continue
    pts.push(...geo.resample(line, SAMPLE_M))
  }
  if (pts.length > CAP) {
    const step = Math.ceil(pts.length / CAP)
    return pts.filter((_, i) => i % step === 0)
  }
  return pts
}

function avgMinDist(pts, lines) {
  if (!pts.length) return Infinity
  let sum = 0
  for (const p of pts) {
    let min = Infinity
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const d = geo.perpDistance(p, line[i - 1], line[i])
        if (d < min) min = d
      }
    }
    sum += min
  }
  return sum / pts.length
}

// 平均偏差（米）：A 的采样点到 B 的最近距离 与 反向 的均值
function meanDeviation(linesA, linesB) {
  const a = samplePoints(linesA)
  const b = samplePoints(linesB)
  if (!a.length || !b.length) return Infinity
  return (avgMinDist(a, linesB) + avgMinDist(b, linesA)) / 2
}

// 偏差 → 分数：0m=100 分，平均偏 120m 约 37 分（指数衰减，GPS 噪声 10-20m 仍可得高分）
function score(linesA, linesB) {
  const dev = meanDeviation(linesA, linesB)
  if (!isFinite(dev)) return 0
  return Math.round(100 * Math.exp(-dev / 120))
}

// 自动寻位的探针：从骑行笔画中选出至多 k 段有代表性的「直线段」（取最长几笔的
// 中段相邻锚点对）。对每个候选位置只贴这几段来估算还原度，严控 API 用量。
function probePairs(rideLines, k = 4) {
  const spacing = 400
  const ranked = rideLines
    .filter(l => l && l.length >= 2)
    .map(l => ({ line: l, len: geo.pathDistance(l) }))
    .sort((a, b) => b.len - a.len)
    .slice(0, k)
  const pairs = []
  for (const { line } of ranked) {
    const anchors = geo.resample(line, spacing)
    if (anchors.length < 2) continue
    const mid = Math.floor((anchors.length - 1) / 2)
    pairs.push([anchors[mid], anchors[Math.min(mid + 1, anchors.length - 1)]])
  }
  return pairs
}

// 单段探针偏差：贴路结果相对 a→b 直线的平均偏离 + 绕路惩罚
function probeDeviation(a, b, snappedPoints) {
  const direct = geo.haversine(a, b)
  if (direct < 1) return 0
  const dev = meanDeviation([[a, b]], [snappedPoints])
  const detour = Math.max(0, geo.pathDistance(snappedPoints) / direct - 1)
  return dev + detour * 120   // 绕路 100% 视同偏离 120m
}

module.exports = { score, meanDeviation, probePairs, probeDeviation }
