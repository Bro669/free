// 我的：我的路线 / 我的骑行
const fmt = require('../../utils/format')

const app = getApp()

Page({
  data: {
    tab: 'routes',          // routes | rides
    routes: [],
    rides: [],
    loading: false,
    loadError: false
  },

  onShow() {
    this.load()
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  async load() {
    this.setData({ loading: true, loadError: false })
    try {
      await app.login()
      const db = wx.cloud.database()
      // 云数据库默认规则下 where({_openid}) 即「仅自己的文档」
      const openid = app.globalData.openid
      const [routesRes, ridesRes] = await Promise.all([
        db.collection('routes').where({ _openid: openid }).orderBy('createdAt', 'desc').limit(50).get(),
        db.collection('rides').where({ _openid: openid }).orderBy('startedAt', 'desc').limit(50).get()
      ])
      this.setData({
        routes: routesRes.data.map(r => ({
          _id: r._id,
          name: r.name,
          text: r.text,
          isPublic: r.isPublic,
          distanceText: fmt.formatDistance(r.distance),
          dateText: fmt.formatDate(r.createdAt)
        })),
        rides: ridesRes.data.map(r => ({
          _id: r._id,
          text: r.text || '自由骑',
          distanceText: fmt.formatDistance(r.distance),
          durationText: fmt.formatDuration(r.durationSec),
          dateText: fmt.formatDate(r.startedAt)
        })),
        loading: false
      })
    } catch (err) {
      console.error('加载失败', err)
      this.setData({ loading: false, loadError: true })
    }
  },

  openRoute(e) {
    wx.navigateTo({ url: '/pages/routeDetail/routeDetail?id=' + e.currentTarget.dataset.id })
  },

  openRide(e) {
    wx.navigateTo({ url: '/pages/record/record?id=' + e.currentTarget.dataset.id })
  },

  goDesign() {
    wx.switchTab({ url: '/pages/design/design' })
  }
})
