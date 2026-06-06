const api = require('../../utils/request');
const { toast } = require('../../utils/util');

Page({
  data: {
    form: null,
    genders: ['男', '女'],
    relations: ['父亲', '母亲', '其他监护人'],
    saving: false
  },

  async onLoad() {
    const form = await api.get('/profile/detail');
    this.setData({ form });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onGenderChange(e) {
    this.setData({ 'form.gender': this.data.genders[e.detail.value] });
  },

  onRelationChange(e) {
    this.setData({ 'form.relation': this.data.relations[e.detail.value] });
  },

  onBirthdayChange(e) {
    this.setData({ 'form.birthday': e.detail.value });
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post('/profile/update', this.data.form);
      // 同步全局昵称
      const app = getApp();
      if (app.globalData.userInfo) {
        app.globalData.userInfo.name = this.data.form.name;
        wx.setStorageSync('userInfo', app.globalData.userInfo);
      }
      toast('保存成功', 'success');
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      toast('保存失败，请重试');
    } finally {
      this.setData({ saving: false });
    }
  }
});
