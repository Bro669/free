/**
 * 轻量 Canvas 2D 图表工具
 * 提供柱状图 / 折线图 / 雷达图，无第三方依赖。
 */

const COLORS = ['#FF8A00', '#3B6EF5', '#34C759', '#AF52DE', '#FF375F', '#5AC8FA'];

// 初始化 Canvas 2D 节点（返回 ctx 与逻辑宽高）
function initCanvas(selector, ctxComp) {
  return new Promise((resolve, reject) => {
    // 组件实例用其自身 query；页面实例兜底用 wx.createSelectorQuery()
    const query =
      ctxComp && typeof ctxComp.createSelectorQuery === 'function'
        ? ctxComp.createSelectorQuery()
        : wx.createSelectorQuery();
    query
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return reject(new Error('canvas 未就绪: ' + selector));
        const { node, width, height } = res[0];
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
        node.width = width * dpr;
        node.height = height * dpr;
        const ctx = node.getContext('2d');
        ctx.scale(dpr, dpr);
        resolve({ ctx, width, height, node });
      });
  });
}

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

/**
 * 柱状图
 * @param {object} cfg { labels:[], values:[], max, valueSuffix }
 */
function drawBar(ctx, w, h, cfg) {
  clear(ctx, w, h);
  const padL = 8, padR = 8, padT = 28, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const baseY = padT + chartH;
  const max = cfg.max || Math.max(...cfg.values) * 1.15 || 1;
  const n = cfg.values.length;
  const slot = chartW / n;
  const barW = Math.min(28, slot * 0.42);

  // 基线
  ctx.strokeStyle = '#EEEEEE';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, baseY);
  ctx.lineTo(padL + chartW, baseY);
  ctx.stroke();

  cfg.values.forEach((v, i) => {
    const cx = padL + slot * i + slot / 2;
    const bh = (v / max) * chartH;
    const top = baseY - bh;
    // 渐变柱
    const grad = ctx.createLinearGradient(0, top, 0, baseY);
    grad.addColorStop(0, '#FFB347');
    grad.addColorStop(1, '#FF8A00');
    ctx.fillStyle = grad;
    roundRectTop(ctx, cx - barW / 2, top, barW, bh, 4);
    ctx.fill();
    // 数值
    ctx.fillStyle = '#666666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(v + (cfg.valueSuffix || ''), cx, top - 6);
    // 标签
    ctx.fillStyle = '#999999';
    ctx.fillText(cfg.labels[i], cx, baseY + 18);
  });
}

/**
 * 折线图（支持多条）
 * @param {object} cfg { xLabels:[], series:[{name,data,color}], max }
 */
function drawLine(ctx, w, h, cfg) {
  clear(ctx, w, h);
  const padL = 28, padR = 14, padT = 20, padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const baseY = padT + chartH;
  let max = cfg.max;
  if (!max) {
    max = Math.max(...cfg.series.flatMap((s) => s.data)) * 1.1 || 1;
  }
  const n = cfg.xLabels.length;
  const step = n > 1 ? chartW / (n - 1) : chartW;

  // 网格 + Y 轴刻度
  ctx.strokeStyle = '#F0F0F0';
  ctx.fillStyle = '#BBBBBB';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  const rows = 4;
  for (let r = 0; r <= rows; r++) {
    const y = padT + (chartH / rows) * r;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
    ctx.fillText(Math.round(max - (max / rows) * r), padL - 6, y + 3);
  }

  // X 标签
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'center';
  cfg.xLabels.forEach((lb, i) => {
    ctx.fillText(lb, padL + step * i, baseY + 18);
  });

  // 折线
  cfg.series.forEach((s, si) => {
    const color = s.color || COLORS[si % COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.data.forEach((v, i) => {
      const x = padL + step * i;
      const y = baseY - (v / max) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 数据点
    ctx.fillStyle = color;
    s.data.forEach((v, i) => {
      const x = padL + step * i;
      const y = baseY - (v / max) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

/**
 * 雷达图
 * @param {object} cfg { labels:[], values:[], max }
 */
function drawRadar(ctx, w, h, cfg) {
  clear(ctx, w, h);
  const cx = w / 2;
  const cy = h / 2 + 6;
  const radius = Math.min(w, h) / 2 - 36;
  const n = cfg.labels.length;
  const max = cfg.max || 100;
  const angle = (Math.PI * 2) / n;
  const start = -Math.PI / 2;

  // 同心多边形网格
  ctx.strokeStyle = '#EAEAEA';
  ctx.lineWidth = 1;
  const rings = 4;
  for (let ring = 1; ring <= rings; ring++) {
    const r = (radius / rings) * ring;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + angle * i;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // 轴线 + 标签
  ctx.fillStyle = '#999999';
  ctx.font = '10px sans-serif';
  for (let i = 0; i < n; i++) {
    const a = start + angle * i;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    ctx.strokeStyle = '#EAEAEA';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    // 标签定位
    const lx = cx + Math.cos(a) * (radius + 16);
    const ly = cy + Math.sin(a) * (radius + 16);
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
    ctx.fillText(cfg.labels[i], lx, ly + 3);
  }

  // 数据区域
  ctx.beginPath();
  cfg.values.forEach((v, i) => {
    const a = start + angle * i;
    const r = (v / max) * radius;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 138, 0, 0.25)';
  ctx.fill();
  ctx.strokeStyle = '#FF8A00';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 顶点
  ctx.fillStyle = '#FF8A00';
  cfg.values.forEach((v, i) => {
    const a = start + angle * i;
    const r = (v / max) * radius;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 仅左上/右上圆角矩形（柱顶）
function roundRectTop(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

module.exports = { initCanvas, drawBar, drawLine, drawRadar, COLORS };
