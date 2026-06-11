// 腾讯位置服务 WebService 封装：骑行路线规划 + polyline 解码 + 串行限流 + 段缓存
// 仅 request 部分依赖 wx，解码函数为纯函数（selftest 可直接验证）。

const config = require('../config')

const REQUEST_INTERVAL = 220   // ms，个人 key 限 5 QPS，串行 + 间隔保险
const cache = new Map()        // 'lat,lng|lat,lng' -> points

// 官方压缩格式：数组前两个值是首点纬/经度，其后是与前前个值的差分 ×10⁶
function decodePolyline(coors) {
  const c = coors.slice()
  for (let i = 2; i < c.length; i++) c[i] = c[i - 2] + c[i] / 1000000
  const pts = []
  for (let i = 0; i + 1 < c.length; i += 2) {
    pts.push({ latitude: c[i], longitude: c[i + 1] })
  }
  return pts
}

function keyOf(from, to) {
  const f = n => n.toFixed(5)
  return `${f(from.latitude)},${f(from.longitude)}|${f(to.latitude)},${f(to.longitude)}`
}

let queue = Promise.resolve()
function enqueue(task) {
  const run = queue.then(task)
  // 无论成败都保持队列推进，并留出限流间隔
  queue = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, REQUEST_INTERVAL)))
  return run
}

function requestBicycling(from, to) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://apis.map.qq.com/ws/direction/v1/bicycling/',
      data: {
        from: `${from.latitude},${from.longitude}`,
        to: `${to.latitude},${to.longitude}`,
        key: config.TENCENT_MAP_KEY
      },
      timeout: 8000,
      success(res) {
        const d = res.data
        if (d && d.status === 0 && d.result && d.result.routes && d.result.routes.length) {
          resolve(decodePolyline(d.result.routes[0].polyline))
        } else {
          reject(new Error((d && d.message) || 'route api error'))
        }
      },
      fail(err) { reject(new Error(err.errMsg || 'network error')) }
    })
  })
}

// 把 from→to 贴到真实道路。失败（无 key/配额尽/网络）降级为直连，snapped:false。
// 返回 { points, snapped }，points 含起终点。
function snapSegment(from, to) {
  if (!config.TENCENT_MAP_KEY) {
    return Promise.resolve({ points: [from, to], snapped: false })
  }
  const k = keyOf(from, to)
  if (cache.has(k)) return Promise.resolve({ points: cache.get(k), snapped: true })
  return enqueue(() => requestBicycling(from, to))
    .then(points => {
      cache.set(k, points)
      return { points, snapped: true }
    })
    .catch(err => {
      console.warn('贴路失败，降级直连:', err.message)
      return { points: [from, to], snapped: false }
    })
}

// 逐段贴路一组锚点；onProgress(done, total) 用于界面进度提示
async function snapAnchors(anchors, onProgress) {
  const segments = []
  const total = anchors.length - 1
  for (let i = 0; i < total; i++) {
    const seg = await snapSegment(anchors[i], anchors[i + 1])
    segments.push(seg)
    if (onProgress) onProgress(i + 1, total)
  }
  return segments
}

module.exports = { decodePolyline, snapSegment, snapAnchors, _cache: cache }
