/**
 * 登录辅助：微信 code 获取
 * 真实微信登录流程：wx.login() 拿 code → 交后端换 openid/token。
 */
function getWxCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('wx.login 无 code'))),
      fail: reject
    });
  });
}

// 手机号脱敏（用于埋点，避免上报明文）
function maskPhone(phone) {
  if (!phone) return '';
  return ('' + phone).replace(/(\d{3})\d{4}(\d{2})/, '$1****$2');
}

module.exports = { getWxCode, maskPhone };
