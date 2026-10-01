// FuturesDesk 主入口:模块装配 / 导航 / 行情轮询 / 状态栏
import { state, settings, applyColor, on, sessionInfo, loadProducts } from './store.js';
import { pollQuotes } from './market.js';
import { engine } from './engine.js';
import { initQuotes, switchView, renderTicker } from './quotes.js';
import { initChart } from './chart.js';
import { initTrade, refreshSummary } from './trade.js';
import { initAI } from './ai.js';
import { initNews } from './news.js';
import { initJournal } from './journal.js';
import { initSettings } from './settings.js';

const $ = s => document.querySelector(s);

applyColor();

document.querySelectorAll('.nav-btn').forEach(b =>
  b.addEventListener('click', () => switchView(b.dataset.view)));

function main() {
  loadProducts();
  initQuotes();
  initChart();
  initTrade();
  initAI();
  initNews();
  initJournal();
  initSettings();
  startPolling();
  setInterval(clock, 1000);
  clock();
  refreshSummary();
  on('pollMs', startPolling);
}

let pollInterval = null;
let pollBusy = false;
let rotationIdx = 0;

function startPolling() {
  clearInterval(pollInterval);
  poll();
  pollInterval = setInterval(poll, settings.pollMs);
}

function neededSyms() {
  const syms = new Set();
  const add = code => { const p = state.productMap.get(code); if (p) syms.add(p.sym); };
  state.watchlist.forEach(add);
  add(state.selected);
  for (const p of engine.positionList()) add(p.code);
  // 全品种轮转刷新(每 tick 10 个,约 21 秒一轮),保证行情列表与行情中心都有数据
  const all = state.products.map(p => p.sym);
  for (let k = 0; k < 10; k++) syms.add(all[(rotationIdx + k) % all.length]);
  rotationIdx = (rotationIdx + 10) % all.length;
  return [...syms];
}

async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const q = await pollQuotes(neededSyms());
    if (q && Object.keys(q).length) {
      state.quotes = { ...state.quotes, ...q };
      engine.onQuotes(q);
      refreshSummary();
      const q0 = state.quotes[state.selected];
      $('#sb-source').innerHTML = `<i class="dot ok"></i>新浪行情 · ${q0?.date || ''} ${q0?.time || ''}`;
    }
  } catch {
    $('#sb-source').innerHTML = '<i class="dot err"></i>行情连接中断,重试中…';
  } finally {
    pollBusy = false;
    (state.listeners['quotes'] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }
}

function clock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
  const s = sessionInfo();
  $('#sb-session').textContent = s.label + (s.open ? '' : ' · 节假日以交易所公告为准');
}

main();
