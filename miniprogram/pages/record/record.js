// 骑行成果：读取骑行记录 → canvas 2d 生成轨迹海报 → 保存相册/分享
const poster = require('../../utils/poster')
const fmt = require('../../utils/format')
const quotes = require('../../utils/quotes')

const app = getApp()

const POSTER_W = 750
const POSTER_H = 1334

Page({
  data: {
    ride: null,
    posterPath: '',
    generating: false,
    statsText: '',
    themes: poster.themeList(),
    themeKey: 'classic',
    quote: ''
  },

  onLoad(options) {
    this.rideId = options.id || ''
    this.load()
  },

  async load() {
    let ride = null
    if (this.rideId) {
      try {
        const res = await wx.cloud.database().collection('rides').doc(this.rideId).get()
        ride = res.data
      } catch (err) {
        console.error('读取骑行记录失败', err)
      }
    }
    if (!ride) ride = app.globalData.lastRide
    if (!ride) {
      wx.showToast({ title: '没有可展示的骑行记录', icon: 'none' })
      return
    }
    this.ride = ride
    this.quoteIdx = ride.startedAt || 0      // 以开始时间做种子，默认金句稳定
    this.setData({
      ride,
      quote: quotes.pick(this.quoteIdx),
      statsText: `${fmt.formatDistance(ride.distance)} · ${fmt.formatDuration(ride.durationSec)}`
    })
    this.generatePoster()
  },

  nextQuote() {
    if (this.data.generating) return
    this.quoteIdx++
    this.setData({ quote: quotes.pick(this.quoteIdx) })
    this.generatePoster()
  },

  generatePoster() {
    this.setData({ generating: true })
    const query = wx.createSelectorQuery()
    query.select('#poster').fields({ node: true, size: true }).exec(res => {
      if (!res[0] || !res[0].node) {
        this.setData({ generating: false })
        wx.showToast({ title: '画布初始化失败', icon: 'none' })
        return
      }
      const canvas = res[0].node
      const dpr = Math.min(wx.getWindowInfo().pixelRatio || 2, 2)
      canvas.width = POSTER_W * dpr
      canvas.height = POSTER_H * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const ride = this.ride
      const segments = ride.track.map(seg =>
        seg.map(([lat, lng]) => ({ latitude: lat, longitude: lng })))
      poster.drawPoster(ctx, POSTER_W, POSTER_H, {
        segments,
        text: ride.text || '',
        distanceKm: fmt.formatDistanceKm(ride.distance),
        durationText: fmt.formatDuration(ride.durationSec),
        speedText: fmt.formatSpeed(ride.avgSpeed),
        dateText: fmt.formatDate(ride.startedAt),
        quote: this.data.quote
      }, this.data.themeKey)

      wx.canvasToTempFilePath({
        canvas,
        success: r => this.setData({ posterPath: r.tempFilePath, generating: false }),
        fail: err => {
          console.error('导出海报失败', err)
          this.setData({ generating: false })
          wx.showToast({ title: '生成海报失败', icon: 'none' })
        }
      })
    })
  },

  selectTheme(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.themeKey || this.data.generating) return
    this.setData({ themeKey: key })
    this.generatePoster()
  },

  previewPoster() {
    if (this.data.posterPath) wx.previewImage({ urls: [this.data.posterPath] })
  },

  saveToAlbum() {
    if (!this.data.posterPath) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存，去朋友圈晒图吧' }),
      fail: err => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: m => { if (m.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/square/square' })
  },

  onShareAppMessage() {
    const ride = this.data.ride
    return {
      title: ride && ride.text
        ? `我骑出了一个「${ride.text}」！${this.data.statsText}`
        : '骑字——在城市里骑出你的名字',
      path: '/pages/square/square',
      imageUrl: this.data.posterPath || undefined
    }
  }
})
