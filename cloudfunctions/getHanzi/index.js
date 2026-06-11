// 拉取 hanzi-writer-data 的单字笔画数据（medians），供小程序端转成可骑字形。
// 云函数可自由访问外网，小程序端无需配置域名白名单。
const https = require('https')

const HOSTS = [
  c => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(c)}.json`,
  c => `https://unpkg.com/hanzi-writer-data@2.0.1/${encodeURIComponent(c)}.json`
]

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode))
      }
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function fetchChar(c) {
  let lastErr
  for (const host of HOSTS) {
    try {
      return await fetchJson(host(c))
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

exports.main = async (event) => {
  const chars = [...new Set(event.chars || [])].slice(0, 8)
  const glyphs = {}
  await Promise.all(chars.map(async c => {
    try {
      const data = await fetchChar(c)
      glyphs[c] = { medians: data.medians }   // 只回传中线，省流量
    } catch (e) {
      console.warn('fetch hanzi failed:', c, e.message)
      glyphs[c] = null
    }
  }))
  return { glyphs }
}
