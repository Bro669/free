# 家长端微信小程序（P0）

基于原型 / UI 设计稿逐模块开发的原生微信小程序。**所有后端接口当前为占位（mock），统一封装，便于后续替换为真实接口。**

## 运行方式

1. 用「微信开发者工具」导入本 `miniprogram` 目录。
2. `project.config.json` 中 `appid` 为 `touristappid`（测试号），正式开发请替换为自己的 AppID。
3. 直接编译预览即可（无需构建步骤）。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss   # 全局逻辑 / 配置 / 设计 Token
├── project.config.json            # 工程配置
├── sitemap.json
├── utils/
│   ├── request.js                 # 统一请求封装（mock 开关在此）
│   ├── mock.js                    # 占位数据中心（接真后端后可删）
│   └── util.js                    # 通用工具
└── pages/
    ├── login/        登录（微信一键 + 短信验证码）
    ├── index/        首页（多孩切换 / 快捷入口 / 消息预览）   [tab]
    ├── school/       校园简介（学校简介 / 学校文化）
    ├── message/      消息中心（全部 / 未读 / 空态）
    ├── score/        成绩查询（柱状图 / 趋势图 / 明细）
    ├── report/       测评报告（列表 + 详情 + 生成中 / 空态）
    ├── teacher/      教师信息（班主任 + 任课教师）
    ├── classroom/    家长课堂（列表 + 详情）
    ├── archive/      成长档案（生涯档案卡）                 [tab]
    ├── mine/         我的                                  [tab]
    ├── profile/      个人信息（表单编辑）
    ├── advisor/      添加生涯顾问（企业微信活码）
    ├── about/        关于我们
    ├── feedback/     意见反馈（文字 + 9 图 + 成功页）
    ├── settings/     账户设置（协议 + 退出）
    └── agreement/    用户协议 / 隐私协议
```

## 接入真实后端

1. 打开 `utils/request.js`，将 `USE_MOCK` 改为 `false`，填写 `BASE_URL`。
2. 按后端实际返回结构调整 `request()` 中的解包逻辑（已标 `TODO`）。
3. 业务页面调用方式（`api.get` / `api.post`）无需改动；确认无误后可删除 `utils/mock.js`。

## 待确认项（来自原型分析，提审 / 上线前必须处理）

- [ ] **品牌 / 小程序名称统一**（原型中「和铖」「一支橙」并存，当前 UI 暂用「一支橙家长端」占位）
- [ ] **关于我们 / 用户协议 / 隐私协议** 替换为正式合规文案（当前为占位，见 `mock.js` 中 `TODO`）
- [ ] **联系电话 / 邮箱** 替换为真实信息
- [ ] **App 图标 / 教师默认头像** 切图补齐
- [ ] **生涯顾问二维码** 替换为后端下发的企业微信活码
- [x] **tabBar 图标**：已补充首页 / 成长档案 / 我的 的选中与未选中图标（`images/tabbar/`）

> 视觉风格：暖橙主色 `#FF8C28`，卡片化布局，设计 Token 定义于 `app.wxss`。
