/**
 * Mock 数据中心（占位）
 * ------------------------------------------------------------------
 * 每个 key 对应一个接口路径，value 为静态数据或 (params)=>data 函数。
 * 接入真实后端后，本文件可整体删除。
 * ------------------------------------------------------------------
 */

const childList = [
  { id: 'c1', name: '李小红', avatar: '', grade: '普通初中2025级', className: '2025级5班', relation: '母亲' },
  { id: 'c2', name: '李小明', avatar: '', grade: '普通初中2027级', className: '2027级3班', relation: '母亲' }
];

module.exports = {
  // ===== 登录 =====
  '/login/wechat': (p) => ({
    token: 'mock_token_wechat',
    userInfo: { id: 'u1', name: '李小红家长', phone: '138****8888', avatar: '' }
  }),
  '/login/sms': (p) => ({
    token: 'mock_token_sms',
    userInfo: { id: 'u1', name: '李小红家长', phone: p.phone || '138****8888', avatar: '' }
  }),
  '/login/sendCode': () => ({ success: true }),

  // ===== 首页 =====
  '/home/index': () => ({
    notice: '王小明的期中考试成绩报告已更新',
    quickEntries: [
      { key: 'score', name: '成绩查询', icon: 'q_score', url: '/pages/score/score' },
      { key: 'report', name: '测评报告', icon: 'q_report', url: '/pages/report/report' },
      { key: 'teacher', name: '教师信息', icon: 'q_teacher', url: '/pages/teacher/teacher' }
    ],
    archiveProgress: 100,
    student: {
      name: '王小明',
      gender: '女',
      city: '陕西省西安市',
      school: '育才中学',
      grade: '2024届',
      studentNo: 'S00001',
      avatar: '',
      updateTime: '2026-01-01 10:01:00'
    }
  }),
  '/child/list': () => ({ list: childList }),

  // ===== 校园简介 =====
  '/school/detail': () => ({
    name: '育才中学',
    logo: '',
    tabs: [
      {
        key: 'intro',
        title: '学校简介',
        content:
          '育才中学创建于1952年，是一所历史悠久、底蕴深厚的省级示范性高级中学。学校占地面积约200亩，环境优美，设施完备，现有教学班60余个，在校学生3000余人，教职工300余人。\n\n学校秉承“求真、向善、尚美”的校训，坚持立德树人，注重学生全面发展，先后获得“全国文明校园”“省级教育教学先进单位”等荣誉称号。'
      },
      {
        key: 'culture',
        title: '学校文化',
        content:
          '校训：求真 向善 尚美\n校风：勤奋 严谨 团结 进取\n教风：敬业 爱生 严谨 创新\n学风：乐学 善思 笃行 致远\n\n学校以“培养有理想、有本领、有担当的时代新人”为育人目标，构建了多元化的课程体系与丰富的校园文化活动。'
      }
    ]
  }),

  // ===== 消息中心 =====
  '/message/list': (p) => {
    const all = [
      { id: 'm1', type: 'score', title: '【李小红】的期中考试成绩报告已生成', desc: '点击查看本次考试各科成绩与班级排名情况。', time: '2025-11-12 10:30', read: false },
      { id: 'm2', type: 'report', title: '【李小红】的职业倾向测评报告已生成', desc: '本次测评结果已出，欢迎家长查看并与孩子沟通。', time: '2025-11-10 09:15', read: false },
      { id: 'm3', type: 'notice', title: '【李小红】的期末家长会通知', desc: '本学期家长会将于本周五下午举行，请准时参加。', time: '2025-11-08 16:00', read: true }
    ];
    const list = p.filter === 'unread' ? all.filter((i) => !i.read) : all;
    return { list };
  },

  // ===== 成绩查询 =====
  '/score/list': (p) => ({
    terms: ['2025-2026学年 上学期', '2024-2025学年 下学期'],
    subjects: [
      { name: '语文', score: 112, full: 120, rank: 8, trend: [105, 108, 110, 112] },
      { name: '数学', score: 135, full: 150, rank: 5, trend: [120, 125, 130, 135] },
      { name: '英语', score: 118, full: 120, rank: 3, trend: [110, 112, 115, 118] },
      { name: '物理', score: 88, full: 100, rank: 12, trend: [80, 82, 85, 88] },
      { name: '化学', score: 92, full: 100, rank: 6, trend: [85, 88, 90, 92] }
    ],
    examName: '2025-2026学年上学期 期中考试',
    totalScore: 545,
    totalRank: 6
  }),

  // ===== 测评报告 =====
  '/report/list': () => ({
    list: [
      { id: 'r1', name: '霍兰德职业兴趣测评', cover: '', time: '2025-11-10 10:30', status: 'done' },
      { id: 'r2', name: 'MBTI性格类型测评', cover: '', time: '2025-10-20 14:00', status: 'done' },
      { id: 'r3', name: '多元智能测评', cover: '', time: '2025-09-15 09:00', status: 'generating' }
    ]
  }),
  '/report/detail': (p) => ({
    id: p.id,
    name: '霍兰德职业兴趣测评',
    time: '2025-11-10 10:30',
    summary: '本次测评结果显示，孩子在“研究型(I)”与“艺术型(A)”维度得分较高，具备较强的探究精神与创造力。',
    dimensions: [
      { name: '现实型 R', value: 60 },
      { name: '研究型 I', value: 88 },
      { name: '艺术型 A', value: 82 },
      { name: '社会型 S', value: 70 },
      { name: '企业型 E', value: 55 },
      { name: '常规型 C', value: 50 }
    ],
    suggestion: '建议关注理工科与设计类相关专业方向，鼓励孩子参与科创、艺术类社团活动以发挥特长。'
  }),

  // ===== 教师信息 =====
  '/teacher/info': () => ({
    grade: '普通初中2025级',
    className: '2025级5班',
    headTeacher: { name: '张强', subject: '语文', gender: '男', degree: '硕士', title: '一级教师', avatar: '' },
    teachers: [
      { name: '李峰', subject: '数学', gender: '男', degree: '本科', title: '高级教师', avatar: '' },
      { name: '王丽', subject: '英语', gender: '女', degree: '硕士', title: '一级教师', avatar: '' },
      { name: '陈建国', subject: '物理', gender: '男', degree: '硕士', title: '高级教师', avatar: '' },
      { name: '赵雪', subject: '化学', gender: '女', degree: '本科', title: '二级教师', avatar: '' }
    ]
  }),

  // ===== 家长课堂 =====
  '/classroom/list': (p) => {
    const all = [
      { id: 'a1', title: '如何帮助孩子做好高中生涯规划', cover: '', time: '2025-11-17 13:11', summary: '生涯规划不仅关乎大学专业的选择……', category: 'career' },
      { id: 'a2', title: '寒假社会实践活动指南', cover: '', time: '2025-11-15 09:30', summary: '丰富的社会实践活动能帮助孩子开阔视野……', category: 'activity' },
      { id: 'a3', title: '青春期亲子沟通的5个技巧', cover: '', time: '2025-10-25 10:00', summary: '了解青春期孩子的心理变化，建立有效沟通……', category: 'career' },
      { id: 'a4', title: '临近高考，考生需要这份心理小妙招', cover: '', time: '2025-10-18 16:45', summary: '考前焦虑、压力大、易怒……这些都是正常现象。', category: 'activity' }
    ];
    const cat = p && p.category;
    const list = !cat || cat === 'all' ? all : all.filter((i) => i.category === cat);
    return { list };
  },
  '/classroom/detail': (p) => ({
    id: p.id,
    title: '临近高考，考生需要这份心理小妙招',
    author: '和铖教育',
    time: '2025-10-18',
    content:
      '考前焦虑、压力大、易怒、失眠……临近高考，很多考生和家长都会感到紧张。其实，适度的紧张有助于发挥，但过度焦虑则会影响状态。\n\n一、接纳情绪。告诉孩子，紧张是正常的，不必为“紧张”而紧张。\n\n二、规律作息。保证充足睡眠，避免熬夜刷题打乱生物钟。\n\n三、适度运动。每天进行30分钟左右的有氧运动，有助于缓解压力。\n\n四、家长支持。多倾听、少说教，给孩子营造轻松的家庭氛围。'
  }),

  // ===== 成长档案（章节式文档）=====
  '/archive/detail': () => ({
    student: { name: '王小明', className: '2024级 初一（4）班', school: 'XXX中学' },
    chapters: [
      { key: 'cover', title: '封面' },
      { key: 'preface', title: '前言' },
      { key: 'catalog', title: '目录' },
      { key: 'portrait', title: '我的画像' },
      { key: 'cognition', title: '自我认知篇' },
      { key: 'explore', title: '环境探索篇' },
      { key: 'dream', title: '我的梦想清单' },
      { key: 'score', title: '学业战绩' }
    ],
    // 各章节内容
    preface:
      '这是一本属于王小明的生涯成长档案。它记录着你在求学路上的点滴成长——从自我认知到环境探索，从梦想清单到学业战绩。愿你以此为镜，认识自己、规划未来，从迷茫走向清晰。',
    catalog: ['前言', '我的画像', '自我认知篇', '环境探索篇', '我的梦想清单', '学业战绩'],
    portrait: [
      { label: '姓名', value: '王小明' },
      { label: '性别', value: '女' },
      { label: '班级', value: '2024级 初一（4）班' },
      { label: '兴趣特长', value: '绘画、钢琴' },
      { label: '座右铭', value: '心之所向，素履以往' }
    ],
    cognition:
      '通过霍兰德职业兴趣测评与 MBTI 性格测评，你展现出较强的研究型与艺术型特质，思维活跃、富有创造力，善于独立思考。建议在学习中发挥探究优势，多参与科创与艺术类活动。',
    explore:
      '环境探索帮助你了解不同的专业与职业世界。结合你的兴趣与能力，理工科、设计类相关方向较为契合。建议主动了解目标院校与专业，参加开放日与职业体验活动。',
    dream: ['考入理想的高中', '系统学习一门乐器', '参加一次科创比赛并获奖', '未来从事与设计相关的工作'],
    // 学业战绩：成绩表格
    scoreTable: {
      subjects: ['语文', '数学', '英语', '政治', '历史', '物理'],
      records: [
        {
          examName: '期中考试', examType: '全校', grade: '普通高中2023级', term: '2024-2025-下学期', date: '2024-06-06',
          scores: [150, 143, 121, 88, 67, 98], total: 888, classRank: 1, gradeRank: 22
        },
        {
          examName: '月考', examType: '全校', grade: '普通高中2023级', term: '2024-2025-下学期', date: '2024-05-06',
          scores: [148, 140, 119, 86, 65, 95], total: 870, classRank: 2, gradeRank: 25
        },
        {
          examName: '期初考试', examType: '全校', grade: '普通高中2023级', term: '2024-2025-下学期', date: '2024-03-06',
          scores: [145, 138, 120, 85, 66, 92], total: 860, classRank: 3, gradeRank: 28
        }
      ]
    }
  }),

  // ===== 我的 / 个人信息 =====
  '/profile/detail': () => ({
    name: '张三',
    avatar: '',
    phone: '13988888888',
    // 关系信息
    relation: '父亲',
    // 地址信息
    province: '广东省 深圳市 福田区',
    addressDetail: '平安大厦',
    // 职业信息
    company: '哇哈哈有限责任公司',
    companyType: '私企',
    industry: '制造业 服务业',
    jobCategory: '市场与销售类',
    jobTitle: '销售总监',
    workYears: '10-20年',
    income: '50-100万',
    // 毕业院校
    graduateSchool: '北京大学',
    graduateMajor: '人力资源管理',
    // 分享意愿
    willShare: '愿意',
    viewMajor: '专业非终身，能力随心长，兴趣是最关键的。',
    viewJob: '职业是价值舞台，热爱加坚持，便能行稳致远。'
  }),
  '/profile/update': () => ({ success: true }),

  // ===== 关于我们 =====
  '/about/info': () => ({
    name: '和铖教育',
    logo: '',
    // TODO: 替换为正式简介文案
    intro:
      '和铖教育致力于为学生提供专业的生涯规划与升学指导服务，通过科学测评、成长档案与一对一顾问，陪伴每一位学生从迷茫走向清晰。',
    phone: '400-888-8888', // TODO: 替换为真实联系电话
    email: '8888888@example.com', // TODO: 替换为真实联系邮箱
    copyright: 'Copyright © 2026 和铖教育 All Rights Reserved.'
  }),

  // ===== 意见反馈 =====
  '/feedback/submit': () => ({ success: true }),

  // ===== 协议（占位文案，提审前需替换为正式合规文本）=====
  '/agreement/detail': (p) => {
    const map = {
      user: {
        title: '用户协议',
        // TODO: 替换为正式《用户协议》全文
        content:
          '欢迎使用本小程序。在使用前请您仔细阅读并同意本《用户协议》。\n\n一、服务内容\n本小程序为家长提供学生成绩查询、测评报告、成长档案等信息服务。\n\n二、账号与使用规范\n您应妥善保管账号信息，不得将账号转借他人使用。\n\n三、知识产权\n本小程序所含内容的知识产权归运营方所有。\n\n（注：本文为占位文案，正式上线前需替换为法务确认的正式版本。）'
      },
      privacy: {
        title: '隐私协议',
        // TODO: 替换为正式《隐私政策》全文
        content:
          '我们非常重视对您个人信息的保护。本《隐私政策》将说明我们如何收集、使用、存储和保护您的个人信息。\n\n一、我们如何收集信息\n在您使用本小程序时，我们可能收集您的手机号、孩子基本信息等。\n\n二、信息的使用\n收集的信息仅用于为您提供相关教育服务。\n\n三、信息安全\n我们采取行业标准的安全措施保护您的信息。\n\n（注：本文为占位文案，正式上线前需替换为法务确认的正式版本。）'
      }
    };
    return map[p.type] || map.user;
  }
};
