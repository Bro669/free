// 汉字字形支持：hanzi-writer-data 的笔画中线（medians）→ 本项目字形格式。
// 数据由小程序端直连 CDN 拉取（jsdelivr 失败切 unpkg），无需任何云函数；
// 需在小程序后台把两个 CDN 加入 request 合法域名（见 README）。
// 内存 + 本地存储两级缓存。convertMedians/rdp 为纯函数，selftest 可直接验证。

const STORAGE_PREFIX = 'hanzi:'
const cache = {}            // char -> glyph { width, strokes }

const HOSTS = [
  c => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(c)}.json`,
  c => `https://unpkg.com/hanzi-writer-data@2.0.1/${encodeURIComponent(c)}.json`
]

function fetchHanzi(c, hostIdx = 0) {
  if (hostIdx >= HOSTS.length) return Promise.reject(new Error('字形数据源均不可用'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: HOSTS[hostIdx](c),
      timeout: 8000,
      success(r) {
        if (r.statusCode === 200 && r.data && r.data.medians) resolve(r.data)
        else fetchHanzi(c, hostIdx + 1).then(resolve, reject)
      },
      fail() { fetchHanzi(c, hostIdx + 1).then(resolve, reject) }
    })
  })
}

function isCJK(c) {
  return /[一-鿿]/.test(c)
}

function glyphMap() { return cache }

// RDP 抽稀（归一化平面坐标），保住笔画拐点（如横折）
function rdp(points, tolerance) {
  if (points.length <= 2) return points.slice()
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    const [x1, y1] = points[s]
    const [x2, y2] = points[e]
    const dx = x2 - x1, dy = y2 - y1
    const len2 = dx * dx + dy * dy
    let maxD = -1, idx = -1
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i]
      let d
      if (len2 === 0) {
        d = Math.hypot(px - x1, py - y1)
      } else {
        let t = ((px - x1) * dx + (py - y1) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy)
      }
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tolerance) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return points.filter((_, i) => keep[i])
}

// hanzi-writer 坐标系：1024 em 盒，y 向上，字面约占 y∈[-124, 900]。
// 转为本项目格式：x/1024，v=(900-y)/1024（y 翻转为向下），全角宽度 1。
function convertMedians(medians) {
  const strokes = medians.map(med => {
    const pts = med.map(([x, y]) => [
      Math.max(0, Math.min(1, x / 1024)),
      Math.max(0, Math.min(1, (900 - y) / 1024))
    ])
    return { points: rdp(pts, 0.015) }
  }).filter(s => s.points.length >= 2)
  return { width: 1, strokes }
}

// 确保 chars 中的汉字字形已就绪（内存 → 本地存储 → CDN），
// 返回加载失败的字符数组。
async function ensure(chars) {
  const need = []
  for (const c of chars) {
    if (!isCJK(c) || cache[c]) continue
    const stored = wx.getStorageSync(STORAGE_PREFIX + c)
    if (stored && stored.strokes) {
      cache[c] = stored
    } else {
      need.push(c)
    }
  }
  if (!need.length) return chars.filter(c => !isCJK(c))

  const failed = []
  await Promise.all(need.map(c =>
    fetchHanzi(c)
      .then(data => {
        const glyph = convertMedians(data.medians)
        cache[c] = glyph
        try { wx.setStorageSync(STORAGE_PREFIX + c, glyph) } catch (e) { /* 存储满则只用内存缓存 */ }
      })
      .catch(() => failed.push(c))
  ))
  return failed.concat(chars.filter(c => !isCJK(c)))
}

module.exports = { isCJK, ensure, glyphMap, convertMedians, rdp }
