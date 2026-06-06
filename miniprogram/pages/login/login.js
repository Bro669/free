const api = require('../../utils/request');
const { toast, isPhone } = require('../../utils/util');

Page({
  data: {
    mode: 'wechat', // wechat | sms
    phone: '',
    code: '',
    counting: 0,
    agree: false,
    submitting: false
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agree: !this.data.agree });
  },

  // 发送验证码
  async sendCode() {
    if (this.data.counting > 0) return;
    if (!isPhone(this.data.phone)) return toast('请输入正确的手机号');
    await api.post('/login/sendCode', { phone: this.data.phone });
    toast('验证码已发送', 'success');
    let n = 60;
    this.setData({ counting: n });
    const timer = setInterval(() => {
      n -= 1;
      this.setData({ counting: n });
      if (n <= 0) clearInterval(timer);
    }, 1000);
  },

  // 微信一键登录
  async wechatLogin() {
    if (!this.checkAgree()) return;
    this.doLogin('/login/wechat', {});
  },

  // 手机验证码登录
  async smsLogin() {
    if (!this.checkAgree()) return;
    if (!isPhone(this.data.phone)) return toast('请输入正确的手机号');
    if (!this.data.code) return toast('请输入验证码');
    this.doLogin('/login/sms', { phone: this.data.phone, code: this.data.code });
  },

  checkAgree() {
    if (!this.data.agree) {
      toast('请先阅读并同意用户协议与隐私协议');
      return false;
    }
    return true;
  },

  async doLogin(url, payload) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await api.post(url, payload);
      getApp().setLogin(res.token, res.userInfo);
      toast('登录成功', 'success');
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) wx.navigateBack();
        else wx.switchTab({ url: '/pages/index/index' });
      }, 600);
    } catch (e) {
      toast('登录失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  openAgreement(e) {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=' + e.currentTarget.dataset.type });
  }
});
