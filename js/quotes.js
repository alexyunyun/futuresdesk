// 行情模块:自选列表 / 行情中心 / 滚动带
import { state, settings, on, emit, setSelected, fmt, fmtPct, cls, fmtSign, digitsOfCode } from './store.js';

const $ = s => document.querySelector(s);

// —— 自选列表(工作台左栏) ———————————————————————————
let wlSig = '';
export function renderWatchlist() {
  const q = ($('#wl-search').value || '').trim().toLowerCase();
  const list = $('#wl-list');
  // 结构签名:只有分组/搜索/自选/选中变化时才重建 DOM,避免行情刷新打断点击
  const shown = [];
  let curGroup = '';
  for (const p of state.products) {
    if (state.wlTab === 'fav' && !state.watchlist.includes(p.sina)) continue;
    if (q && !p.name.toLowerCase().includes(q) && !p.sym.toLowerCase().includes(q)) continue;
    shown.push({ p, head: p.group !== curGroup });
    curGroup = p.group;
  }
  const sig = [state.wlTab, q, state.selected, state.watchlist.join(','), shown.map(x => x.p.sina).join(',')].join('|');
  if (sig !== wlSig) {
    wlSig = sig;
    const rows = [];
    for (const { p, head } of shown) {
      if (head) rows.push(`<div class="wl-group">${p.group}</div>`);
      const sel = p.sina === state.selected ? 'sel' : '';
      const star = state.watchlist.includes(p.sina) ? 'on' : '';
      rows.push(`
      <div class="wl-row ${sel}" data-code="${p.sina}">
        <span class="wl-star ${star}" data-star="${p.sina}">★</span>
        <span class="wl-name"><b>${p.name}</b><span>${p.exch}·${p.sym.toUpperCase()}</span></span>
        <span class="wl-last"></span>
        <span class="wl-pct"></span>
      </div>`);
    }
    list.innerHTML = rows.join('') || '<div class="empty-tip">无匹配品种</div>';
  }
  // 价格单元格原地更新
  for (const { p } of shown) {
    const row = list.querySelector(`.wl-row[data-code="${p.sina}"]`);
    if (!row) continue;
    const quote = state.quotes[p.sina];
    const lastEl = row.querySelector('.wl-last');
    const pctEl = row.querySelector('.wl-pct');
    const c = cls(quote?.change);
    lastEl.textContent = fmt(quote?.last, p.digits);
    lastEl.className = `wl-last ${c}`;
    pctEl.textContent = fmtPct(quote?.changePct);
    pctEl.className = `wl-pct ${c}`;
  }
}

function initWatchlistEvents() {
  $('#wl-search').addEventListener('input', renderWatchlist);
  document.querySelectorAll('.wtab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.wtab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.wlTab = b.dataset.wtab;
    renderWatchlist();
  }));
  $('#wl-list').addEventListener('click', e => {
    const star = e.target.closest('[data-star]');
    if (star) {
      const code = star.dataset.star;
      const i = state.watchlist.indexOf(code);
      if (i >= 0) state.watchlist.splice(i, 1); else state.watchlist.push(code);
      localStorage.setItem('fd.watchlist', JSON.stringify(state.watchlist));
      renderWatchlist();
      e.stopPropagation();
      return;
    }
    const row = e.target.closest('.wl-row');
    if (row) setSelected(row.dataset.code);
  });
  // 滚动带点击:选中品种并回到工作台
  $('#ticker').addEventListener('click', e => {
    const item = e.target.closest('.tk-item');
    if (!item) return;
    setSelected(item.dataset.code);
    switchView('workbench');
  });
}

// —— 滚动带 ——————————————————————————————————————
const TICKER_CODES = ['nf_RB0', 'nf_HC0', 'nf_I0', 'nf_CU0', 'nf_AL0', 'nf_AU0', 'nf_AG0', 'nf_M0', 'nf_Y0', 'nf_TA0', 'nf_SA0', 'nf_SC0', 'nf_LC0', 'CFF_RE_IF0', 'CFF_RE_IM0', 'CFF_RE_T0'];
export function renderTicker() {
  const el = $('#ticker-items');
  // 结构稳定:先补齐缺失的项,再原地更新数字
  if (el.children.length !== TICKER_CODES.length) {
    el.innerHTML = TICKER_CODES.map(code =>
      `<span class="tk-item" data-code="${code}"><span class="tk-name"></span><span class="mono tk-p"></span><span class="mono tk-c"></span></span>`).join('');
  }
  TICKER_CODES.forEach((code, i) => {
    const p = state.productMap.get(code);
    const q = state.quotes[code];
    const node = el.children[i];
    if (!p || !q) { node.style.display = 'none'; return; }
    node.style.display = '';
    node.querySelector('.tk-name').textContent = p.name;
    const pe = node.querySelector('.tk-p'), ce = node.querySelector('.tk-c');
    const c = cls(q.change);
    pe.textContent = fmt(q.last, p.digits);
    pe.className = `mono tk-p ${c}`;
    ce.textContent = fmtPct(q.changePct);
    ce.className = `mono tk-c ${c}`;
  });
}

// —— 行情中心 ——————————————————————————————————————
let rank = 'all', sortKey = null, sortDir = -1;

export function renderGroupCards() {
  const groups = [...new Set(state.products.map(p => p.group))];
  $('#group-cards').innerHTML = groups.map(g => {
    const items = state.products.filter(p => p.group === g && state.quotes[p.sina]);
    if (!items.length) return `<div class="gcard"><div class="k">${g}</div><div class="v muted">--</div><div class="n">等待行情</div></div>`;
    const up = items.filter(p => state.quotes[p.sina].change > 0).length;
    const down = items.filter(p => state.quotes[p.sina].change < 0).length;
    const avg = items.reduce((s, p) => s + state.quotes[p.sina].changePct, 0) / items.length;
    return `<div class="gcard" data-group="${g}" style="cursor:pointer" title="点击过滤">
      <div class="k">${g}</div>
      <div class="v ${cls(avg)}">${fmtPct(avg)}</div>
      <div class="n">${items.length}品种 · 涨${up} 跌${down}</div>
    </div>`;
  }).join('');
}

export function renderMarketTable() {
  const q = ($('#mt-search').value || '').trim().toLowerCase();
  let items = state.products
    .filter(p => state.quotes[p.sina])
    .map(p => ({ ...state.quotes[p.sina], sym: p.sym.toUpperCase(), name: p.name, digits: p.digits, sina: p.sina, group: p.group }));
  if (marketGroupFilter) items = items.filter(x => x.group === marketGroupFilter);
  if (q) items = items.filter(x => x.name.toLowerCase().includes(q) || x.sym.toLowerCase().includes(q));
  if (rank === 'up') items = items.filter(x => x.change > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 20);
  else if (rank === 'down') items = items.filter(x => x.change < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 20);
  else if (rank === 'vol') items = items.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 30);
  else if (rank === 'oi') items = items.sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0)).slice(0, 30);
  else if (sortKey) items = items.sort((a, b) => ((a[sortKey] ?? -1e15) - (b[sortKey] ?? -1e15)) * sortDir);

  $('#mt-table tbody').innerHTML = items.map(x => `
    <tr data-code="${x.sina}">
      <td><b>${x.name}</b><span>${x.sym}</span></td>
      <td class="num ${cls(x.change)}">${fmt(x.last, x.digits)}</td>
      <td class="num ${cls(x.change)}">${fmtSign(x.change, x.digits)}</td>
      <td class="num ${cls(x.change)}">${fmtPct(x.changePct)}</td>
      <td class="num">${fmt(x.open, x.digits)}</td>
      <td class="num">${fmt(x.high, x.digits)}</td>
      <td class="num">${fmt(x.low, x.digits)}</td>
      <td class="num">${fmt(x.volume, 0)}</td>
      <td class="num">${fmt(x.openInterest, 0)}</td>
    </tr>`).join('') || '<tr><td colspan="9" class="empty-tip">暂无行情数据</td></tr>';
}

function initMarketEvents() {
  document.querySelectorAll('#rank-tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#rank-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    rank = b.dataset.r; sortKey = null;
    renderMarketTable();
  }));
  $('#mt-search').addEventListener('input', renderMarketTable);
  $('#mt-table thead').addEventListener('click', e => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.k) return;
    if (sortKey === th.dataset.k) sortDir *= -1; else { sortKey = th.dataset.k; sortDir = -1; }
    rank = 'all';
    document.querySelectorAll('#rank-tabs button').forEach(x => x.classList.toggle('active', x.dataset.r === 'all'));
    renderMarketTable();
  });
  $('#mt-table tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-code]');
    if (tr) { setSelected(tr.dataset.code); switchView('workbench'); }
  });
  $('#group-cards').addEventListener('click', e => {
    const card = e.target.closest('.gcard');
    if (!card) return;
    // 点击板块卡:再点一次取消过滤
    marketGroupFilter = marketGroupFilter === card.dataset.group ? null : card.dataset.group;
    document.querySelectorAll('#group-cards .gcard').forEach(c =>
      c.style.boxShadow = c.dataset.group === marketGroupFilter ? 'inset 0 0 0 1px var(--ink)' : '');
    rank = 'all'; sortKey = null;
    renderMarketTable();
  });
}
let marketGroupFilter = null;

export function switchView(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'market') { marketGroupFilter = null; renderGroupCards(); renderMarketTable(); }
  emit('view', name);
}

export function initQuotes() {
  initWatchlistEvents();
  initMarketEvents();
  on('quotes', () => {
    renderWatchlist();
    renderTicker();
    if (document.querySelector('#view-market.active')) { renderGroupCards(); renderMarketTable(); }
  });
  on('products', renderWatchlist);
}
