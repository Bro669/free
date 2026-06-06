/**
 * 统一请求封装
 * ------------------------------------------------------------------
 * 当前为「占位」实现：所有接口走本地 mock（utils/mock.js）。
 * 接入真实后端时，把 USE_MOCK 置为 false，并在下方补全 BASE_URL 即可，
 * 业务页面无需改动调用方式。
 * ------------------------------------------------------------------
 */
const mock = require('./mock');

// TODO: 接入真实后端时关闭 mock 并填写网关地址
const USE_MOCK = true;
const BASE_URL = 'https://api.example.com'; // TODO: 替换为真实域名

// 模拟网络延迟，便于联调 loading 态
function delay(data, ms = 300) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), ms);
  });
}

/**
 * 发起请求
 * @param {string} url    接口路径，如 '/score/list'
 * @param {object} options { method, data, header }
 * @returns {Promise<any>} 解包后的业务数据
 */
function request(url, options = {}) {
  if (USE_MOCK) {
    const handler = mock[url];
    if (!handler) {
      return Promise.reject(new Error('Mock 未定义接口: ' + url));
    }
    const result = typeof handler === 'function' ? handler(options.data || {}) : handler;
    return delay(result);
  }

  // ===== 真实后端请求（占位，待接入）=====
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: options.method || 'GET',
      data: options.data || {},
      header: Object.assign(
        { 'content-type': 'application/json', Authorization: app.globalData.token },
        options.header || {}
      ),
      success(res) {
        // TODO: 按后端实际返回结构调整解包逻辑
        if (res.statusCode === 200 && res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(res.data || res);
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  get: (url, data) => request(url, { method: 'GET', data }),
  post: (url, data) => request(url, { method: 'POST', data }),
  request
};
