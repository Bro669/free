# 家长端微信小程序（P0）

基于原型 / UI 设计稿逐模块开发的原生微信小程序。**所有后端接口当前为占位（mock），统一封装，便于后续替换为真实接口。**

## 运行方式

1. 用「微信开发者工具」导入本 `miniprogram` 目录。
2. `project.config.json` 中 `appid` 为 `touristappid`（测试号），正式开发请替换为自己的 AppID。
3. 直接编译预览即可（无需构建步骤）。

## 目录结构

> 项目根目录下另有 `docs/`，存放原型 / UI 设计分析文档与原始原型图。

```
miniprogram/                            微信小程序工程（原生，无构建步骤）
├── app.js                              全局逻辑（登录态 / 全局数据）
├── app.json                            应用配置（页面注册 + tabBar + 窗口）
├── app.wxss                            全局样式 & 设计 Token（暖橙主色）
├── project.config.json                 工程配置
├── sitemap.json
├── README.md
│
├── images/
│   └── tabbar/                         tabBar 图标（未选中灰 / 选中橙）
│       ├── home.png / home-active.png
│       ├── archive.png / archive-active.png
│       └── mine.png / mine-active.png
│
├── utils/                              公共能力
│   ├── request.js                      统一请求封装（USE_MOCK 开关在此）
│   ├── mock.js                         占位数据中心（接真后端后可删）
│   ├── chart.js                        Canvas 2D 图表（柱状 / 折线 / 雷达）
│   └── util.js                         通用工具（格式化 / 校验 / toast）
│
└── pages/                              18 个页面 / 17 个模块
    ├── login/        登录（微信一键 + 短信验证码）
    ├── index/        首页（多孩切换 / 快捷入口 / 消息预览）   [tab]
    ├── school/       校园简介（学校简介 / 学校文化）
    ├── message/      消息中心（全部 / 未读 / 空态）
    ├── score/        成绩查询（柱状图 / 趋势折线 + 明细）
    ├── report/       测评报告
    │                 ├── report.*  列表（生成中 / 空态）
    │                 └── detail.*  详情（6 维度雷达图）
    ├── teacher/      教师信息（班主任 + 任课教师）
    ├── classroom/    家长课堂
    │                 ├── classroom.*  文章列表
    │                 └── detail.*     文章详情
    ├── archive/      成长档案（生涯档案卡）                 [tab]
    ├── mine/         我的                                  [tab]
    ├── profile/      个人信息（表单编辑）
    ├── advisor/      添加生涯顾问（企业微信活码）
    ├── about/        关于我们
    ├── feedback/     意见反馈（文字 + 9 图 + 成功页）
    ├── settings/     账户设置（协议 + 退出确认）
    └── agreement/    用户协议 / 隐私协议
```

> 每个页面目录均为微信小程序标准四件套：`.js`（逻辑）/ `.json`（页面配置）/ `.wxml`（结构）/ `.wxss`（样式）。

## 接入真实后端

1. 打开 `utils/request.js`，将 `USE_MOCK` 改为 `false`，填写 `BASE_URL`。
2. 按后端实际返回结构调整 `request()` 中的解包逻辑（已标 `TODO`）。
3. 业务页面调用方式（`api.get` / `api.post`）无需改动；确认无误后可删除 `utils/mock.js`。

## 埋点（数据上报）

统一封装于 `utils/track.js`，与 mock 同风格：当前 `USE_MOCK=true` 仅 `console` 输出，接后端只需置为 `false` 并填 `REPORT_URL`（`POST /track/report`）。

- **页面 PV / 停留时长**：由 `app.js` 全局注入（重写 `Page`），无需逐页埋点 → `page_view` / `page_leave(duration)`。
- **公共属性自动附加**：`session_id / user_id / role / student_id / scene / 设备信息 / network`。
- **手动事件**：页面内调用 `track.track(event, params)`，已接入关键点（登录、首页快捷入口/课堂、测评详情、档案章节、我的菜单、个人信息编辑/保存、反馈提交、顾问扫码等）。
- **可靠性**：批量上报（满 10 条或每 5s），失败写本地缓存下次启动补传。

上报契约：
```
POST /track/report
{ common:{session_id,user_id,role,student_id,scene,brand,model,app_version,network},
  events:[ {event, ts, page, params}, ... ] }
```

> 合规：采集前需用户同意隐私协议；仅传 id，不传明文手机号 / 姓名等 PII。

## 待确认项（来自原型分析，提审 / 上线前必须处理）

- [ ] **品牌 / 小程序名称统一**（原型中「和铖」「一支橙」并存，当前 UI 暂用「一支橙家长端」占位）
- [ ] **关于我们 / 用户协议 / 隐私协议** 替换为正式合规文案（当前为占位，见 `mock.js` 中 `TODO`）
- [ ] **联系电话 / 邮箱** 替换为真实信息
- [ ] **App 图标 / 教师默认头像** 切图补齐
- [ ] **生涯顾问二维码** 替换为后端下发的企业微信活码
- [x] **tabBar 图标**：已补充首页 / 成长档案 / 我的 的选中与未选中图标（`images/tabbar/`）

> 视觉风格：暖橙主色 `#FF8C28`，卡片化布局，设计 Token 定义于 `app.wxss`。
