const api = require('../../utils/request');

Page({
  data: { info: null },

  async onLoad() {
    const info = await api.get('/about/info');
    this.setData({ info });
  },

  callPhone() {
    if (this.data.info.phone) {
      wx.makePhoneCall({ phoneNumber: this.data.info.phone.replace(/-/g, '') });
    }
  },

  copyEmail() {
    wx.setClipboardData({ data: this.data.info.email });
  }
});
