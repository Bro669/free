const config = require('./config')

App({
  globalData: {
    openid: '',
    cloudReady: false,
    // design 页跳转传参用（小程序页面间传大对象不走 url）
    pendingRoute: null,
    lastRide: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库过低，无法使用云开发')
      return
    }
    wx.cloud.init({
      env: config.CLOUD_ENV || undefined,
      traceUser: true
    })
    this.globalData.cloudReady = true
    this.login()
  },

  // 零云函数取 openid：往 users 集合写一条记录，读回云端自动注入的 _openid，
  // 缓存本地后删掉这条记录（删除失败也无妨，users 仅用作引导）。
  login() {
    if (this.loginPromise) return this.loginPromise
    const cached = wx.getStorageSync('openid')
    if (cached) {
      this.globalData.openid = cached
      this.loginPromise = Promise.resolve(cached)
      return this.loginPromise
    }
    const db = wx.cloud.database()
    let docId = ''
    this.loginPromise = db.collection('users').add({ data: { createdAt: Date.now() } })
      .then(res => {
        docId = res._id
        return db.collection('users').doc(docId).get()
      })
      .then(res => {
        const openid = res.data._openid
        this.globalData.openid = openid
        wx.setStorageSync('openid', openid)
        db.collection('users').doc(docId).remove().catch(() => {})
        return openid
      })
      .catch(err => {
        console.error('获取 openid 失败（请确认云环境已开通且已创建 users 集合）', err)
        this.loginPromise = null
        return ''
      })
    return this.loginPromise
  }
})
