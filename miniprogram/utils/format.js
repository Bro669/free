// 显示格式化纯函数

function formatDistance(meters) {
  if (meters == null) return '--'
  if (meters < 1000) return Math.round(meters) + ' m'
  return (meters / 1000).toFixed(meters < 100000 ? 1 : 0) + ' km'
}

function formatDistanceKm(meters) {
  return (meters / 1000).toFixed(1)
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// m/s → km/h 字符串
function formatSpeed(mps) {
  if (!mps || !isFinite(mps)) return '0.0'
  return (mps * 3.6).toFixed(1)
}

function formatDate(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

function formatDateTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

module.exports = { formatDistance, formatDistanceKm, formatDuration, formatSpeed, formatDate, formatDateTime }
