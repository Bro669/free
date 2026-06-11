#!/usr/bin/env node
// 生成全部海报主题的 SVG 预览（docs/poster-preview.svg）。
// 实现一个最小的 canvas 2d → SVG 适配器喂给 poster.drawPoster，
// 用 glyphs 投影出的「R8」字形当样例轨迹。

const fs = require('fs')
const path = require('path')
const U = p => require(path.join(__dirname, '../miniprogram/utils', p))
const poster = U('poster')
const { layout, project } = U('projection')

class SvgCtx {
  constructor() {
    this.defs = []
    this.els = []
    this.fillStyle = '#000'
    this.strokeStyle = '#000'
    this.lineWidth = 1
    this.font = '10px sans-serif'
    this.textAlign = 'left'
    this.lineJoin = 'miter'
    this.lineCap = 'butt'
    this.globalAlpha = 1
    this._path = []
  }
  createLinearGradient(x0, y0, x1, y1) {
    const id = 'g' + this.defs.length
    const stops = []
    this.defs.push({ id, x0, y0, x1, y1, stops })
    return { _id: id, addColorStop: (o, c) => stops.push([o, c]) }
  }
  _fill() { return typeof this.fillStyle === 'object' ? `url(#${this.fillStyle._id})` : this.fillStyle }
  fillRect(x, y, w, h) {
    const op = this.globalAlpha < 1 ? ` fill-opacity="${this.globalAlpha.toFixed(3)}"` : ''
    this.els.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${this._fill()}"${op}/>`)
  }
  beginPath() { this._path = [] }
  moveTo(x, y) { this._path.push(`M${x.toFixed(1)},${y.toFixed(1)}`) }
  lineTo(x, y) { this._path.push(`L${x.toFixed(1)},${y.toFixed(1)}`) }
  stroke() {
    if (!this._path.length) return
    this.els.push(`<path d="${this._path.join(' ')}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"/>`)
  }
  fillText(t, x, y) {
    const m = /(bold )?(\d+)px/.exec(this.font)
    const size = m ? m[2] : 14
    const weight = m && m[1] ? 'bold' : 'normal'
    const anchor = this.textAlign === 'center' ? 'middle' : 'start'
    this.els.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${weight}" font-family="sans-serif" text-anchor="${anchor}" fill="${this._fill()}">${t}</text>`)
  }
  toSvg(w, h) {
    const defs = this.defs.map(d =>
      `<linearGradient id="${d.id}" x1="${d.x0}" y1="${d.y0}" x2="${d.x1}" y2="${d.y1}" gradientUnits="userSpaceOnUse">` +
      d.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
      `</linearGradient>`).join('')
    return { defs, body: this.els.join('\n') }
  }
}

// 样例轨迹：把 "R8" 投影到上海坐标，骑行笔画当作轨迹段
const lay = layout('R8')
const strokes = project(lay, {
  center: { latitude: 31.2304, longitude: 121.4737 },
  heightMeters: 1500,
  rotationDeg: 0
})
const segments = strokes.filter(s => s.ride).map(s => s.points)

const W = 750, H = 1334, GAP = 40
const themes = poster.themeList()
let combinedDefs = ''
let combinedBody = ''
themes.forEach((t, i) => {
  const ctx = new SvgCtx()
  poster.drawPoster(ctx, W, H, {
    segments,
    text: 'R8',
    distanceKm: '21.5',
    durationText: '1:42:08',
    speedText: '12.6',
    dateText: '2026.06.11',
    quote: '没有白骑的路，每一公里都算数'
  }, t.key)
  const { defs, body } = ctx.toSvg(W, H)
  combinedDefs += defs.replace(/id="g/g, `id="t${i}g`).replace(/url\(#g/g, `url(#t${i}g`)
  combinedBody += `<g transform="translate(${i * (W + GAP)},40)">` +
    body.replace(/url\(#g/g, `url(#t${i}g`) +
    `<text x="${W / 2}" y="-10" font-size="36" font-family="sans-serif" text-anchor="middle" fill="#333">${t.name}（${t.key}）</text></g>\n`
})

const totalW = themes.length * (W + GAP) - GAP
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW / 2}" viewBox="-20 -20 ${totalW + 40} ${H + 100}">
<rect x="-20" y="-20" width="${totalW + 40}" height="${H + 100}" fill="#fafafa"/>
<defs>${combinedDefs}</defs>
${combinedBody}
</svg>
`
const out = path.join(__dirname, '../docs/poster-preview.svg')
fs.writeFileSync(out, svg)
console.log('written:', out, Math.round(svg.length / 1024) + 'KB')
