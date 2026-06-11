// GPX 1.1 生成（纯函数）：把路线导出给码表/骑行 App（佳明、行者、Strava 等）。
// 输入坐标为 GCJ-02（微信/腾讯地图坐标系），输出前逐点转 WGS-84。
const geo = require('./geo')

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// lines: [[{latitude, longitude}...]]，每条线一个 trkseg（衔接段也包含，保证整条可走）
function buildTrackGpx(name, lines) {
  const segs = lines
    .filter(l => l && l.length >= 2)
    .map(line => {
      const pts = line.map(p => {
        const w = geo.gcj02ToWgs84(p)
        return `      <trkpt lat="${w.latitude.toFixed(6)}" lon="${w.longitude.toFixed(6)}"/>`
      }).join('\n')
      return `    <trkseg>\n${pts}\n    </trkseg>`
    }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="骑字" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
${segs}
  </trk>
</gpx>
`
}

module.exports = { buildTrackGpx }
