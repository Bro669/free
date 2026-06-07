const api = require('../../utils/request');
const track = require('../../utils/track');
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
        track.track('feedback_add_image', { count: paths.length });
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
      // 先逐张上传图片获取 url（mock 下直接回传本地路径），再随表单提交
      const urls = [];
      for (const path of this.data.images) {
        urls.push(await api.uploadFile(path));
      }
      await api.post('/feedback/submit', {
        content: this.data.content,
        images: urls
      });
      track.track('feedback_submit', { img_count: urls.length, success: true });
      this.setData({ success: true });
    } catch (e) {
      track.track('feedback_submit', { img_count: this.data.images.length, success: false });
      toast('提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  back() {
    wx.navigateBack();
  }
});
