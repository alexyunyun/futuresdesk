// 图表模块:基于 klinecharts v10(分时 / 分钟K / 日周K + 主副图指标 + 实时撮合最新bar)
import { state, settings, on, fmt, fmtSign, fmtPct, cls } from './store.js';
import { fetchKline, fetchContracts } from './market.js';

const $ = s => document.querySelector(s);
const K = window.klinecharts;

const PERIOD_MAP = {
  fs: { type: 'minute', span: 1 },
  1: { type: 'minute', span: 1 },
  5: { type: 'minute', span: 5 },
  15: { type: 'minute', span: 15 },
  30: { type: 'minute', span: 30 },
  60: { type: 'hour', span: 1 },
  daily: { type: 'day', span: 1 },
  week: { type: 'week', span: 1 },
};
let curPeriod = '5';
let chart = null;
let chartEl = null;
let subCb = null;
let curMainInd = 'MA';
let curSubInd = 'VOL';
let contractCode = null;   // 当前图表合约代码(nf_RB0 / nf_RB2610)
let lastBars = [];          // 缓存当前K线数据(用于实时合并)

// —— 自定义指标:分时均价(VWAP) ————————————————————————
K.registerIndicator({
  name: 'FSAVG',
  shortName: '均价',
  figures: [{ key: 'avg', title: '均价: ', type: 'line' }],
  calc: dataList => {
    let cv = 0, vv = 0;
    return dataList.map(d => {
      const v = d.volume || 0;
      cv += d.close * v; vv += v;
      return { avg: vv ? cv / vv : d.close };
    });
  },
});

function toTs(t) {
  return new Date((t.includes(' ') ? t.replace(' ', 'T') : t + 'T00:00:00') + '+08:00').getTime();
}
function toKLineData(arr) {
  return arr.map(d => ({
    timestamp: toTs(d.t), open: d.o, high: d.h, low: d.l, close: d.c,
    volume: d.v, turnover: d.oi,
  }));
}

function candleStyles() {
  const rg = settings.color === 'rg';
  if (rg) {
    return {
      candle: {
        type: 'candle_solid',
        bar: {
          upColor: '#d64541', downColor: '#2f9e44',
          upBorderColor: '#d64541', downBorderColor: '#2f9e44',
          upWickColor: '#d64541', downWickColor: '#2f9e44',
        },
      },
    };
  }
  // 黑白:阳线描边空心,阴线实心
  return {
    candle: {
      type: 'candle_up_stroke',
      bar: {
        upColor: '#ffffff', downColor: '#111111',
        upBorderColor: '#111111', downBorderColor: '#111111',
        upWickColor: '#111111', downWickColor: '#111111',
      },
    },
  };
}

function baseStyles() {
  const rg = settings.color === 'rg';
  return {
    grid: { horizontal: { color: '#f2f2f2' }, vertical: { color: '#f2f2f2' } },
    xAxis: { tickText: { color: '#9b9b9b' }, axisLine: { color: '#e8e8e8' }, tickLine: { color: '#e8e8e8' } },
    yAxis: { tickText: { color: '#9b9b9b' }, axisLine: { color: '#e8e8e8' }, tickLine: { color: '#e8e8e8' } },
    separator: { color: '#e8e8e8' },
    crosshair: {
      horizontal: { color: '#757575' },
      vertical: { color: '#757575' },
    },
    candle: {
      priceMark: {
        last: rg
          ? { show: true, text: { color: '#616161' } }
          : { show: true, upColor: '#757575', downColor: '#757575', noChangeColor: '#757575', text: { color: '#616161' } },
        high: { show: false }, low: { show: false },
      },
      area: { lineColor: '#111111', backgroundColor: [{ offset: 0, color: 'rgba(0,0,0,0.08)' }, { offset: 1, color: 'rgba(0,0,0,0)' }], lineSize: 1 },
    },
    indicator: { lines: [{ color: '#111' }, { color: '#777' }, { color: '#b5b5b5' }, { color: '#555' }], bars: [{ color: '#555' }, { color: '#bbb' }] },
  };
}

function indStyles() {
  const rg = settings.color === 'rg';
  const grayLines = [{ color: '#111' }, { color: '#8a8a8a' }, { color: '#c2c2c2' }, { color: '#555' }];
  // v10 柱体颜色走 upColor/downColor/noChangeColor 三元组
  const grayBars = [{ upColor: '#3d3d3d', downColor: '#b8b8b8', noChangeColor: '#8a8a8a' }];
  const rgBars = [{}];
  return {
    MA: { lines: grayLines },
    BOLL: { lines: grayLines },
    VOL: rg ? rgBars : { bars: grayBars },
    MACD: rg ? rgBars : { bars: grayBars, lines: [{ color: '#111' }, { color: '#999' }] },
    KDJ: { lines: grayLines },
    RSI: { lines: grayLines },
  };
}

async function fetchBars() {
  // 分时 = 1分钟K的当日切片;休市日回退到最近一个有数据的交易日
  const p = curPeriod === 'fs' ? '1' : curPeriod;
  const sym = contractCode.replace(/^nf_|^CFF_RE_/, '');
  const raw = await fetchKline(sym, p);
  let data = raw;
  if (curPeriod === 'fs') {
    const todayCn = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    data = raw.filter(d => d.t.slice(0, 10) === todayCn);
    if (!data.length && raw.length) {
      const lastDay = raw[raw.length - 1].t.slice(0, 10);
      data = raw.filter(d => d.t.slice(0, 10) === lastDay);
    }
  }
  lastBars = data;
  return toKLineData(data);
}

function buildChart() {
  // v10 的 init 会复用容器上的旧实例,必须先对容器本身 dispose
  if (chartEl) { K.dispose(chartEl); chart = null; subCb = null; chartEl = null; }
  const el = $('#chart-el');
  chartEl = el;
  chart = K.init(el, { locale: 'zh-CN' });
  window.__fdChart = chart;
  chart.setStyles(baseStyles());
  chart.setStyles(candleStyles());
  try { chart.setTimezone('Asia/Shanghai'); } catch { /* 忽略 */ }
  chart.setDataLoader({
    getBars: ({ callback }) => {
      fetchBars()
        .then(data => {
          if (!data.length) $('#chart-legend').textContent = '该合约暂无K线数据';
          callback(data, false);
        })
        .catch(err => { $('#chart-legend').textContent = `K线加载失败:${err.message}`; callback([], false); });
    },
    subscribeBar: ({ callback }) => { subCb = callback; },
    unsubscribeBar: () => { subCb = null; },
  });
  const p = state.productMap.get(contractCode) || { digits: 2 };
  chart.setSymbol({ ticker: contractCode, pricePrecision: p.digits ?? 2, volumePrecision: 0 });
  chart.setPeriod(PERIOD_MAP[curPeriod]);
  // 指标
  const isFs = curPeriod === 'fs';
  if (isFs) {
    chart.createIndicator({ name: 'FSAVG', styles: { lines: [{ color: '#8a8a8a', styles: 'dashed' }] } }, true);
  } else if (curMainInd) {
    const st = indStyles()[curMainInd];
    chart.createIndicator({ name: curMainInd, calcParams: curMainInd === 'MA' ? [5, 10, 20, 60] : undefined, styles: st }, true);
  }
  if (isFs) chart.setStyles({ candle: { type: 'area' } });
  const subName = isFs ? 'VOL' : curSubInd;
  chart.createIndicator({ name: subName, styles: indStyles()[subName] }, false);
  // 十字光标 readout
  try {
    chart.subscribeAction('crosshair', () => renderLegend());
  } catch { /* 忽略 */ }
  renderLegend();
}

// —— 实时行情合并 ————————————————————————————————————
function bucketMs() {
  const p = curPeriod;
  if (p === 'fs' || p === '1') return 60e3;
  if (p === '5') return 5 * 60e3;
  if (p === '15') return 15 * 60e3;
  if (p === '30') return 30 * 60e3;
  if (p === '60') return 60 * 60e3;
  return 24 * 3600e3; // daily / week
}

export function onQuote(q) {
  if (!q || !contractCode) return;
  renderHeader(q);
  renderLegend();
  if (q.code !== contractCode || !subCb) return;
  const last = q.last;
  if (last == null) return;
  const tsStr = `${q.date} ${String(q.time).padStart(6, '0')}`.trim();
  let ts;
  if (q.time && q.date) {
    const hh = q.time.slice(0, 2), mm = q.time.slice(2, 4);
    ts = toTs(`${q.date} ${hh}:${mm}:00`);
  } else {
    ts = Date.now();
  }
  const bms = bucketMs();
  const bucket = Math.floor(ts / bms) * bms;
  const kl = lastBars.length ? lastBars[lastBars.length - 1] : null;
  const klBucket = kl ? Math.floor(toTs(kl.t.length === 10 ? kl.t + ' 00:00:00' : kl.t) / bms) * bms : null;
  if (kl && klBucket === bucket) {
    kl.c = last; kl.h = Math.max(kl.h, last); kl.l = Math.min(kl.l, last);
    subCb({ timestamp: bucket === ts ? ts : bucket, open: kl.o, high: kl.h, low: kl.l, close: kl.c, volume: kl.v });
  } else if (bucket > (klBucket || 0)) {
    const nb = { t: tsStr, o: last, h: last, l: last, c: last, v: 0, oi: q.openInterest || 0 };
    lastBars.push(nb);
    subCb({ timestamp: bucket, open: last, high: last, low: last, close: last, volume: 0 });
  }
}

export function renderHeader(q) {
  const p = state.productMap.get(contractCode);
  if (!p) return;
  $('#ch-name').textContent = p.name;
  const label = contractCode.endsWith('0') ? '主力连续' : contractCode.replace(/^nf_|^CFF_RE_/, '').toUpperCase();
  $('#ch-code').textContent = `${p.exch} · ${p.sym.toUpperCase()} ${label}`;
  const dd = p.digits;
  $('#ch-last').textContent = q ? fmt(q.last, dd) : '--';
  $('#ch-last').className = `mono ${q ? cls(q.change) : ''}`;
  $('#ch-chg').textContent = q ? `${fmtSign(q.change, dd)}  ${fmtPct(q.changePct)}` : '';
  $('#ch-chg').className = `mono ${q ? cls(q.change) : ''}`;
}

function renderLegend() {
  const q = state.quotes[contractCode];
  const p = state.productMap.get(contractCode);
  if (!p) return;
  const dd = p.digits;
  const parts = [];
  if (q) {
    parts.push(`最新 ${fmt(q.last, dd)}`, `开 ${fmt(q.open, dd)}`, `高 ${fmt(q.high, dd)}`, `低 ${fmt(q.low, dd)}`,
      `昨结 ${fmt(q.preSettle, dd)}`, `量 ${fmt(q.volume, 0)}`, `持仓 ${fmt(q.openInterest, 0)}`);
    if (q.avg) parts.push(`均价 ${fmt(q.avg, dd)}`);
  }
  $('#chart-legend').textContent = parts.join('   ');
}

// —— 合约选择(主力 + 月份) ————————————————————————————
let contractListCache = new Map();   // sym -> [{sina,label}]
export async function buildContractSelect() {
  const p = state.productMap.get(state.selected);
  const sel = $('#contract-select');
  if (!p) { sel.innerHTML = ''; return; }
  let months = contractListCache.get(p.sym);
  if (!months) {
    try {
      months = await fetchContracts(p);
      contractListCache.set(p.sym, months);
    } catch { months = []; }
  }
  sel.innerHTML = `<option value="${p.sina}">主力连续</option>` +
    months.map(m => `<option value="${m.sina}">${m.label}</option>`).join('');
  sel.value = contractCode || p.sina;
  if (sel.selectedIndex < 0) { sel.value = p.sina; }
}

export function setContract(code) {
  contractCode = code;
  buildContractSelect();
  buildChart();
  renderHeader(state.quotes[code]);
}

export function getContract() { return contractCode; }

export function initChart() {
  contractCode = state.selected;
  buildContractSelect();
  buildChart();
  renderHeader(state.quotes[contractCode]);

  document.querySelectorAll('#chart-periods button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#chart-periods button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    curPeriod = b.dataset.p;
    buildChart();
  }));
  $('#chart-main-ind').addEventListener('change', e => { curMainInd = e.target.value; buildChart(); });
  $('#chart-sub-ind').addEventListener('change', e => { curSubInd = e.target.value; buildChart(); });
  $('#contract-select').addEventListener('change', e => {
    const code = e.target.value;
    state.selected = code;
    localStorage.setItem('fd.selected', code);
    emit('select', code);
  });

  on('quotes', () => {
    const q = state.quotes[contractCode];
    if (q) onQuote(q);
  });
  on('select', code => { if (code !== contractCode) setContract(code); });
  on('colorChanged', () => buildChart());
}
