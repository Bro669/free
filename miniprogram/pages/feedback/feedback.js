const api = require('../../utils/request');
const { toast } = require('../../utils/util');

Page({
  data: {
    content: '',
    images: [],
    maxImages: 9,
    submitting: false,
    success: false
  },

  onInput(e) {
    this.setData({ content: e.detail.value });
  },

  chooseImage() {
    const remain = this.data.maxImages - this.data.images.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath);
        this.setData({ images: this.data.images.concat(paths) });
      }
    });
  },

  previewImage(e) {
    wx.previewImage({
      current: this.data.images[e.currentTarget.dataset.index],
      urls: this.data.images
    });
  },

  removeImage(e) {
    const images = this.data.images.slice();
    images.splice(e.currentTarget.dataset.index, 1);
    this.setData({ images });
  },

  async submit() {
    if (!this.data.content.trim()) return toast('请输入反馈内容');
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      // TODO: 真实环境需先上传图片获取 url，再随表单提交
      await api.post('/feedback/submit', {
        content: this.data.content,
        images: this.data.images
      });
      this.setData({ success: true });
    } catch (e) {
      toast('提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  back() {
    wx.navigateBack();
  }
});
