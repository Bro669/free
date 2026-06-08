const api = require('../../utils/request');
const track = require('../../utils/track');

Page({
  data: {
    school: null,
    activeTab: 0
  },

  async onLoad() {
    const school = await api.get('/school/detail');
    this.setData({ school });
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    const tab = this.data.school && this.data.school.tabs[index];
    track.track('school_tab_switch', { tab: tab && tab.key });
    this.setData({ activeTab: index });
  }
});
