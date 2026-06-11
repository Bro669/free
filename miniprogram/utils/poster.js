// 轨迹海报绘制：传入 canvas 2d ctx 与逻辑尺寸，纯绘制逻辑不依赖 wx API
const geo = require('./geo')

// segments: [[{latitude, longitude}...]]，把轨迹画进 box（局部米坐标防形变）
function drawTrack(ctx, segments, box) {
  const all = segments.flat()
  if (all.length < 2) return
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
  const tx = p => offX + (p.x - minX) * scale
  const ty = p => offY + (maxY - p.y) * scale   // y 北朝上 → canvas 向下翻转

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // 发光底层 + 主线两遍描边
  const passes = [
    { color: 'rgba(25, 195, 125, 0.35)', width: 22 },
    { color: '#2BE08F', width: 10 }
  ]
  for (const pass of passes) {
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.width
    for (const seg of local) {
      if (seg.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(tx(seg[0]), ty(seg[0]))
      for (let i = 1; i < seg.length; i++) ctx.lineTo(tx(seg[i]), ty(seg[i]))
      ctx.stroke()
    }
  }
}

// data: { segments, text, distanceKm, durationText, speedText, dateText }
// w/h 为逻辑像素（调用方负责 ctx.scale(dpr)）
function drawPoster(ctx, w, h, data) {
  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#0C1F16')
  bg.addColorStop(1, '#16382A')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 顶部标语
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${Math.round(w * 0.032)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('我 在 城 市 里 骑 出 了', w / 2, h * 0.08)

  if (data.text) {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${Math.round(w * 0.1)}px sans-serif`
    ctx.fillText(data.text, w / 2, h * 0.155)
  }

  // 轨迹主体
  drawTrack(ctx, data.segments, { x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.42 })

  // 分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(w * 0.08, h * 0.68)
  ctx.lineTo(w * 0.92, h * 0.68)
  ctx.stroke()

  // 距离大字
  ctx.fillStyle = '#2BE08F'
  ctx.font = `bold ${Math.round(w * 0.14)}px sans-serif`
  ctx.fillText(data.distanceKm, w / 2, h * 0.78)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
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
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${Math.round(w * 0.042)}px sans-serif`
    ctx.fillText(num, x, h * 0.885)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `${Math.round(w * 0.026)}px sans-serif`
    ctx.fillText(label, x, h * 0.915)
  })

  // 底部署名
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `${Math.round(w * 0.026)}px sans-serif`
  ctx.fillText('骑字 · 在城市里骑出你的名字', w / 2, h * 0.965)
}

module.exports = { drawPoster, drawTrack }
