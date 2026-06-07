Page({
  data: {
    benefits: ['升学路径分析', '专业与职业匹配评估', '个性化规划方案制定', '长期成长跟踪建议']
  },
  // QR 占位，真实环境替换为后端下发的企业微信活码图片
  previewQr() {
    wx.showToast({ title: '请长按二维码识别添加', icon: 'none' });
  }
});
