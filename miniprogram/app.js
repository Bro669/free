const config = require('./config')

App({
  globalData: {
    openid: '',
    cloudReady: false,
    // design 页跳转传参用（小程序页面间传大对象不走 url）
    pendingRoute: null
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

  login() {
    if (this.loginPromise) return this.loginPromise
    this.loginPromise = wx.cloud.callFunction({ name: 'login' })
      .then(res => {
        this.globalData.openid = res.result.openid
        return res.result.openid
      })
      .catch(err => {
        console.error('login 云函数调用失败（请确认已上传部署 cloudfunctions/login）', err)
        this.loginPromise = null
        return ''
      })
    return this.loginPromise
  }
})
