const api = require('../../utils/request');
const track = require('../../utils/track');

Page({
  data: {
    form: null,
    sections: [
      { key: 'relation', title: '关系信息', dot: '#FF5A8A' },
      { key: 'address', title: '地址信息', dot: '#2FB344' },
      { key: 'occupation', title: '职业信息', dot: '#3B6EF5' },
      { key: 'school', title: '毕业院校', dot: '#8B5CF6' },
      { key: 'share', title: '分享意愿', dot: '#FF8A00' }
    ]
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const form = await api.get('/profile/detail');
    this.setData({ form });
  },

  editSection(e) {
    const key = e.currentTarget.dataset.key;
    track.track('profile_edit_open', { section: key });
    wx.navigateTo({ url: '/pages/profile/edit?section=' + key });
  },

  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({ 'form.avatar': res.tempFiles[0].tempFilePath });
        // TODO: 上传头像到后端
      }
    });
  }
});
