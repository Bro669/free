/**
 * 统一请求封装（接后端就绪版）
 * ------------------------------------------------------------------
 * 切换真实后端：把 USE_MOCK 置为 false，填 BASE_URL，并按你们后端核对
 * 下方「响应结构配置」与「鉴权配置」。业务页面调用方式不变。
 * ------------------------------------------------------------------
 */
const mock = require('./mock');
const track = require('./track');

// ===== 总开关 =====
const USE_MOCK = true; // TODO: 接后端时改为 false
const BASE_URL = ''; // TODO: 填写网关地址，如 https://api.example.com 或本地 http://localhost:8080
const UPLOAD_PATH = '/upload'; // TODO: 文件上传接口

// ===== 响应结构配置（按后端实际调整）=====
const CODE_FIELD = 'code';
const DATA_FIELD = 'data';
const MSG_FIELD = 'message';
const SUCCESS_CODE = 0; // TODO: 后端成功码（有的用 200 / '00000'）
const UNAUTH_CODES = [401, 40100]; // 登录失效码（http 状态或业务码）

// ===== 鉴权配置 =====
const TOKEN_HEADER = 'Authorization';
const TOKEN_PREFIX = 'Bearer '; // 无前缀则置为 ''

// ===== 字段适配层：后端字段 → 前端契约（key = 接口 path）=====
// 后端字段名与前端不一致时在此集中转换，避免改动页面。示例：
// '/home/index': (d) => ({ ...d, student: d.studentInfo }),
const adapters = {};

function applyAdapter(url, data) {
  return adapters[url] ? adapters[url](data) : data;
}

function delay(data, ms = 300) {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

function getToken() {
  const app = getApp && getApp();
  return (app && app.globalData && app.globalData.token) || '';
}

// 登录失效处理
function handleUnauth() {
  const app = getApp && getApp();
  if (app && app.logout) app.logout();
  wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
  setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 800);
}

/**
 * 发起请求
 * @param {string} url 接口路径
 * @param {object} options { method, data, header, loading }
 */
function request(url, options = {}) {
  // ===== Mock 分支 =====
  if (USE_MOCK) {
    const handler = mock[url];
    if (!handler) return Promise.reject(new Error('Mock 未定义接口: ' + url));
    const result = typeof handler === 'function' ? handler(options.data || {}) : handler;
    return delay(applyAdapter(url, result));
  }

  // ===== 真实请求 =====
  if (options.loading) wx.showLoading({ title: '加载中', mask: true });
  const token = getToken();
  const header = Object.assign({ 'content-type': 'application/json' }, options.header || {});
  if (token) header[TOKEN_HEADER] = TOKEN_PREFIX + token;

  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: options.method || 'GET',
      data: options.data || {},
      header,
      success(res) {
        const body = res.data || {};
        const code = body[CODE_FIELD];
        // 登录失效
        if (UNAUTH_CODES.includes(res.statusCode) || UNAUTH_CODES.includes(code)) {
          handleUnauth();
          return reject(body);
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && code === SUCCESS_CODE) {
          resolve(applyAdapter(url, body[DATA_FIELD]));
        } else {
          track.track('api_error', { url, code, msg: body[MSG_FIELD] });
          reject(body);
        }
      },
      fail(err) {
        track.track('api_error', { url, code: 'NETWORK', msg: err.errMsg });
        reject(err);
      },
      complete() {
        if (options.loading) wx.hideLoading();
      }
    });
  });
}

/**
 * 文件上传（图片：反馈 / 头像）
 * @returns {Promise<string>} 返回文件 URL
 */
function uploadFile(filePath, formData = {}) {
  if (USE_MOCK) return delay(filePath, 200); // mock：直接回传本地路径

  const token = getToken();
  const header = {};
  if (token) header[TOKEN_HEADER] = TOKEN_PREFIX + token;

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + UPLOAD_PATH,
      filePath,
      name: 'file',
      formData,
      header,
      success(res) {
        try {
          const body = JSON.parse(res.data);
          if (body[CODE_FIELD] === SUCCESS_CODE) {
            // TODO: 按后端返回结构取 url 字段
            const d = body[DATA_FIELD];
            resolve(typeof d === 'string' ? d : d.url);
          } else {
            reject(body);
          }
        } catch (e) {
          reject(e);
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  get: (url, data, opt) => request(url, Object.assign({ method: 'GET', data }, opt)),
  post: (url, data, opt) => request(url, Object.assign({ method: 'POST', data }, opt)),
  uploadFile,
  request
};
