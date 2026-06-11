#!/usr/bin/env node
// 生成全部字形的 SVG 预览（docs/glyphs-preview.svg），便于审稿字形设计
const fs = require('fs')
const path = require('path')
const glyphs = require('../miniprogram/utils/glyphs')

const CELL = 120
const PAD = 18
const COLS = 9
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
const rows = Math.ceil(chars.length / COLS)

let body = ''
chars.forEach((c, idx) => {
  const g = glyphs[c]
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  const ox = col * CELL + PAD
  const oy = row * CELL + PAD
  const s = CELL - PAD * 2
  const cx = ox + (s - g.width * s) / 2   // 字符内水平居中
  body += `<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" fill="none" stroke="#eee"/>`
  body += `<text x="${col * CELL + 6}" y="${row * CELL + 16}" font-size="12" fill="#999">${c}</text>`
  for (const st of g.strokes) {
    const d = st.points
      .map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`)
      .join(' ')
    body += `<path d="${d}" fill="none" stroke="#19C37D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
  }
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CELL}" height="${rows * CELL}" viewBox="0 0 ${COLS * CELL} ${rows * CELL}">
<rect width="100%" height="100%" fill="white"/>
${body}
</svg>
`
const out = path.join(__dirname, '../docs/glyphs-preview.svg')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, svg)
console.log('written:', out)
