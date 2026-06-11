// 语音播报（TTS）：基于官方「微信同声传译」插件 WechatSI（免费）。
// 可选依赖：app.json 未声明插件或账号未添加插件时，requirePlugin 抛错，
// 这里捕获后全部接口静默降级（isAvailable() 返回 false），不影响其他功能。

let plugin = null
try {
  plugin = requirePlugin('WechatSI')
} catch (e) {
  console.warn('未启用同声传译插件，语音播报不可用（详见 README「语音播报」）')
}

let audio = null
let enabled = true
let lastText = ''
let lastAt = 0
let playing = false
const queue = []                        // 待播 src 队列（不打断当前播报）
const QUEUE_MAX = 2
const cache = new Map()                 // text -> { src, expireAt }
const CACHE_TTL = 5 * 60 * 1000         // 插件返回的音频地址短期有效
const REPEAT_GAP = 8000                 // 相同文案最小重播间隔

function isAvailable() { return !!plugin }

function setEnabled(v) {
  enabled = !!v
  if (!enabled) {
    queue.length = 0
    playing = false
    if (audio) audio.stop()
  }
}

function ensureAudio() {
  if (audio) return audio
  audio = wx.createInnerAudioContext()
  audio.obeyMuteSwitch = false          // 导航播报在 iOS 静音键下也要出声
  const next = () => {
    playing = false
    if (queue.length) play(queue.shift())
  }
  audio.onEnded(next)
  audio.onError(next)
  return audio
}

function play(src) {
  // 排队而非打断：连续到达的提示依次播完（队列超限丢最旧的）
  if (playing) {
    queue.push(src)
    if (queue.length > QUEUE_MAX) queue.shift()
    return
  }
  playing = true
  const a = ensureAudio()
  a.src = src
  a.play()
}

function speak(text) {
  if (!plugin || !enabled || !text) return
  const now = Date.now()
  if (text === lastText && now - lastAt < REPEAT_GAP) return
  lastText = text
  lastAt = now
  const hit = cache.get(text)
  if (hit && hit.expireAt > now) return play(hit.src)
  plugin.textToSpeech({
    lang: 'zh_CN',
    tts: true,
    content: text,
    success: res => {
      if (res.retcode === 0 && res.filename) {
        cache.set(text, { src: res.filename, expireAt: Date.now() + CACHE_TTL })
        play(res.filename)
      }
    },
    fail: err => console.warn('TTS 合成失败', err)
  })
}

module.exports = { speak, setEnabled, isAvailable }
