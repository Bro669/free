/**
 * 埋点上报 SDK（轻量、无依赖）
 * ------------------------------------------------------------------
 * - 当前为「占位」实现：USE_MOCK=true 时仅 console 输出，便于本地查看。
 *   接入后端时把 USE_MOCK 置为 false，并填 REPORT_URL（POST /track/report）。
 * - 公共属性自动附加；事件批量上报；失败本地缓存，下次启动补传。
 * - 页面 PV / 停留时长由 app.js 全局注入，无需逐页埋点。
 * ------------------------------------------------------------------
 */

// TODO: 接入真实上报时切换
const USE_MOCK = true;
const REPORT_URL = 'https://api.example.com/track/report'; // TODO: 替换为真实上报地址

const FLUSH_SIZE = 10; // 满 N 条立即上报
const FLUSH_INTERVAL = 5000; // 否则每 5s 上报一次
const BACKUP_KEY = 'track_backup'; // 失败缓存 key

let queue = [];
let timer = null;
let sessionId = '';
let device = {};
// 业务公共属性（登录后补充）
const common = {
  user_id: '',
  role: '',
  student_id: '',
  scene: ''
};

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 初始化：采集设备信息、生成 session、补传上次失败数据
function init(options = {}) {
  sessionId = uuid();
  if (options.scene != null) common.scene = options.scene;
  try {
    const dev = (wx.getDeviceInfo && wx.getDeviceInfo()) || {};
    const base = (wx.getAppBaseInfo && wx.getAppBaseInfo()) || {};
    device = {
      brand: dev.brand,
      model: dev.model,
      app_version: base.version,
      sdk_version: base.SDKVersion
    };
  } catch (e) {
    device = {};
  }
  // 补传上次失败缓存
  try {
    const backup = wx.getStorageSync(BACKUP_KEY);
    if (backup && backup.length) {
      queue = backup.concat(queue);
      wx.removeStorageSync(BACKUP_KEY);
      flush();
    }
  } catch (e) {}
}

// 设置/更新业务公共属性
function setCommon(obj = {}) {
  Object.assign(common, obj);
}

function netType(cb) {
  wx.getNetworkType({ success: (r) => cb(r.networkType), fail: () => cb('unknown') });
}

// 上报单个事件
function track(event, params = {}) {
  const page = currentRoute();
  const item = {
    event,
    ts: Date.now(),
    page,
    params
  };
  queue.push(item);
  if (queue.length >= FLUSH_SIZE) flush();
  else scheduleFlush();
}

// 页面 PV / 离开（由 app.js 调用）
function trackPageView(route) {
  track('page_view', {});
  // 单独保留 route 已在 page 字段，无需重复
}
function trackPageLeave(route, duration) {
  track('page_leave', { duration });
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_INTERVAL);
}

// 批量上报
function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue;
  queue = [];

  netType((network) => {
    const payload = {
      common: Object.assign({ session_id: sessionId, network }, common, device),
      events
    };

    if (USE_MOCK) {
      console.log('[track] report', payload);
      return;
    }

    wx.request({
      url: REPORT_URL,
      method: 'POST',
      data: payload,
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (!(res.statusCode >= 200 && res.statusCode < 300)) backup(events);
      },
      fail: () => backup(events)
    });
  });
}

// 失败缓存，下次启动补传
function backup(events) {
  try {
    const old = wx.getStorageSync(BACKUP_KEY) || [];
    wx.setStorageSync(BACKUP_KEY, old.concat(events).slice(-200));
  } catch (e) {}
}

function currentRoute() {
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  return cur ? '/' + cur.route : '';
}

module.exports = { init, setCommon, track, trackPageView, trackPageLeave, flush };
