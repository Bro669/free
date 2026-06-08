const api = require('../../utils/request');
const track = require('../../utils/track');
const { toast } = require('../../utils/util');

// 各分区的字段配置（驱动表单渲染）
const SECTIONS = {
  relation: {
    title: '编辑关系信息',
    fields: [
      { field: 'relation', label: '家庭关系', type: 'picker', options: ['父亲', '母亲', '其他监护人'] }
    ]
  },
  address: {
    title: '编辑地址信息',
    fields: [
      { field: 'province', label: '所在地区', type: 'region' },
      { field: 'addressDetail', label: '详细地址', type: 'input', placeholder: '请输入详细地址' }
    ]
  },
  occupation: {
    title: '编辑职业信息',
    fields: [
      { field: 'company', label: '工作单位', type: 'input', placeholder: '请输入工作单位' },
      { field: 'companyType', label: '单位类型', type: 'picker', options: ['国企', '私企', '外企', '事业单位', '个体', '其他'] },
      { field: 'industry', label: '所属行业', type: 'input', placeholder: '请输入所属行业' },
      { field: 'jobCategory', label: '职业类别', type: 'input', placeholder: '请输入职业类别' },
      { field: 'jobTitle', label: '职业名称', type: 'input', placeholder: '请输入职业名称' },
      { field: 'workYears', label: '工作年限', type: 'picker', options: ['1年以下', '1-3年', '3-5年', '5-10年', '10-20年', '20年以上'] },
      { field: 'income', label: '年收入', type: 'picker', options: ['10万以下', '10-30万', '30-50万', '50-100万', '100万以上'] }
    ]
  },
  school: {
    title: '编辑毕业院校',
    fields: [
      { field: 'graduateSchool', label: '毕业院校', type: 'input', placeholder: '请输入毕业院校' },
      { field: 'graduateMajor', label: '毕业专业', type: 'input', placeholder: '请输入毕业专业' }
    ]
  },
  share: {
    title: '编辑分享意愿',
    fields: [
      { field: 'willShare', label: '是否愿意分享职场经验', type: 'picker', options: ['愿意', '不愿意'] },
      { field: 'viewMajor', label: '对专业的看法', type: 'textarea', placeholder: '请输入您对专业的看法' },
      { field: 'viewJob', label: '对职业的看法', type: 'textarea', placeholder: '请输入您对职业的看法' }
    ]
  }
};

Page({
  data: {
    section: '',
    fields: [],
    form: {},
    saving: false
  },

  async onLoad(query) {
    const section = query.section || 'relation';
    const cfg = SECTIONS[section];
    wx.setNavigationBarTitle({ title: cfg.title });
    const all = await api.get('/profile/detail');
    // 仅取本分区相关字段
    const form = {};
    cfg.fields.forEach((f) => { form[f.field] = all[f.field] || ''; });
    this.setData({ section, fields: cfg.fields, form });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onPicker(e) {
    const field = e.currentTarget.dataset.field;
    const f = this.data.fields.find((x) => x.field === field);
    this.setData({ ['form.' + field]: f.options[e.detail.value] });
  },

  onRegion(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value.join(' ') });
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post('/profile/update', this.data.form);
      track.track('profile_save', { section: this.data.section, success: true });
      toast('保存成功', 'success');
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      toast('保存失败，请重试');
    } finally {
      this.setData({ saving: false });
    }
  }
});
