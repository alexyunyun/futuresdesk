// 交易模块:下单面板 / 盘口 / 持仓 / 委托 / 成交 / 资金曲线与流水
import { state, on, fmt, fmtSign, fmtPct, cls, fmtWan } from './store.js';
import { engine } from './engine.js';
import { getContract } from './chart.js';

const $ = s => document.querySelector(s);

let curDir = 'buy';
let summary = null;
let expandedPos = null;

export function initTrade() {
  // 方向
  $('#ord-buy').addEventListener('click', () => setDir('buy'));
  $('#ord-sell').addEventListener('click', () => setDir('sell'));
  $('#ord-offset').addEventListener('change', () => { if ($('#ord-offset').value === 'close') setDir(curDir); renderEst(); });
  $('#ord-type').addEventListener('change', () => {
    $('#ord-price').disabled = $('#ord-type').value === 'market';
    renderEst();
  });
  $('#ord-minus').addEventListener('click', () => stepPrice(-1));
  $('#ord-plus').addEventListener('click', () => stepPrice(1));
  $('#ord-qty').addEventListener('input', renderEst);
  $('#ord-price').addEventListener('input', renderEst);
  document.querySelectorAll('.qty-quick button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.q === 'max') {
      const acc = summary?.account;
      const p = state.productMap.get(getContract());
      if (acc && p) {
        const last = state.quotes[getContract()]?.last || +$('#ord-price').value || 0;
        const per = last * p.mult * p.margin;
        $('#ord-qty').value = Math.max(1, Math.floor((acc.available * 0.9) / per));
      }
    } else $('#ord-qty').value = b.dataset.q;
    renderEst();
  }));
  $('#ord-cond').addEventListener('change', e => {
    $('#cond-trigger-row').style.display = e.target.checked ? 'flex' : 'none';
  });
  $('#ord-submit').addEventListener('click', submitOrder);
  $('#btn-close-all').addEventListener('click', () => {
    if (!confirm('确认以市价平掉全部持仓?')) return;
    const r = engine.closeAll();
    showMsg(r.msg || '已提交全部平仓', !r.ok);
    refreshSummary();
  });
  // tabs
  document.querySelectorAll('.ttab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.ttab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ['pos', 'ord', 'trd', 'fund'].forEach(t => {
      $(`#tab-${t}`).style.display = b.dataset.t === t ? '' : 'none';
    });
    if (b.dataset.t === 'fund') drawEquity();
  }));
  // 行情联动:价格自动填充最新价
  on('quotes', () => {
    renderLadder();
    const q = state.quotes[getContract()];
    const priceInput = $('#ord-price');
    if (q?.last && (!priceInput.value || document.activeElement !== priceInput)) {
      priceInput.value = fmtPrice(q.last);
    }
    renderEst();
  });
  on('select', () => {
    const q = state.quotes[getContract()];
    if (q?.last) $('#ord-price').value = fmtPrice(q.last);
    $('#ord-qty').value = 1;
    $('#ord-sl').value = ''; $('#ord-tp').value = ''; $('#ord-trigger').value = '';
    $('#ord-cond').checked = false;
    $('#cond-trigger-row').style.display = 'none';
    renderLadder(); renderEst();
  });
  on('summary', s => { renderSummary(s); renderEst(); });
}

function setDir(d) {
  curDir = d;
  $('#ord-buy').classList.toggle('active', d === 'buy');
  $('#ord-sell').classList.toggle('active', d === 'sell');
  const submit = $('#ord-submit');
  submit.textContent = d === 'buy' ? '买入开多' : '卖出开空';
  submit.classList.toggle('sell-now', d === 'sell');
}

function fmtPrice(v) {
  const p = state.productMap.get(getContract());
  return v != null ? (+v).toFixed(p?.digits ?? 2) : '';
}

function stepPrice(mult) {
  const p = state.productMap.get(getContract());
  if (!p) return;
  const cur = parseFloat($('#ord-price').value) || state.quotes[getContract()]?.last || 0;
  const next = Math.max(0, cur + mult * p.tick);
  $('#ord-price').value = fmtPrice(next.toFixed(p.digits));
  renderEst();
}

export function renderLadder() {
  const q = state.quotes[getContract()];
  const el = $('#ladder');
  if (!q || q.last == null) { el.innerHTML = '<div class="empty-tip" style="padding:10px 0">等待行情…</div>'; return; }
  const p = state.productMap.get(getContract());
  const dd = p?.digits ?? 2;
  const row = (label, price) => price == null ? '' : `
    <div class="ladder-row" data-price="${price}">
      <span class="lp">${label}</span>
      <span class="ladder-bar"><i style="width:100%"></i></span>
      <span class="lv mono">${fmt(price, dd)}</span>
    </div>`;
  el.innerHTML =
    row('卖一', q.ask) +
    `<div class="ladder-sep"><span>最新</span><span></span><span class="mono">${fmt(q.last, dd)}</span></div>` +
    row('买一', q.bid);
  el.querySelectorAll('.ladder-row').forEach(r => r.addEventListener('click', () => {
    $('#ord-type').value = 'limit';
    $('#ord-price').disabled = false;
    $('#ord-price').value = fmtPrice(r.dataset.price);
    renderEst();
  }));
}

export function renderEst() {
  const p = state.productMap.get(getContract());
  const el = $('#ord-est');
  if (!p) { el.innerHTML = ''; return; }
  const qty = parseInt($('#ord-qty').value) || 0;
  const type = $('#ord-type').value;
  const price = type === 'market'
    ? (state.quotes[getContract()]?.last || 0)
    : (parseFloat($('#ord-price').value) || 0);
  const margin = price * p.mult * qty * p.margin;
  const fee = price * p.mult * qty * (p.fee / 10000);
  const notional = price * p.mult * qty;
  el.innerHTML = `<span>名义 ${fmtWan(notional)}</span><span>保证金 ≈ ${fmtWan(margin)}</span><span>手续费 ≈ ${fee.toFixed(1)}</span>`;
}

function submitOrder() {
  const code = getContract();
  const type = $('#ord-type').value;
  const body = {
    code,
    dir: curDir,
    offset: $('#ord-offset').value,
    type,
    price: type === 'limit' ? parseFloat($('#ord-price').value) : null,
    qty: parseInt($('#ord-qty').value),
    sl: parseFloat($('#ord-sl').value) || null,
    tp: parseFloat($('#ord-tp').value) || null,
    kind: $('#ord-cond').checked ? 'condition' : 'normal',
    trigger: $('#ord-cond').checked ? parseFloat($('#ord-trigger').value) || null : null,
  };
  const r = engine.placeOrder(body);
  if (r.ok) {
    showMsg(r.order.status === 'filled'
      ? `已成交:${r.order.dir === 'buy' ? '买' : '卖'} ${r.order.qty} 手 @ ${r.order.fillPrice}`
      : '委托已提交,等待成交');
    refreshSummary();
  } else {
    showMsg(r.msg || '下单失败', true);
  }
}

function showMsg(text, isErr = false) {
  const el = $('#ord-msg');
  el.textContent = text;
  el.style.fontWeight = isErr ? '600' : '400';
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => { el.textContent = ''; }, 5000);
}

// —— 账户条 ————————————————————————————————————
export function renderAccountStrip(acc) {
  const items = [
    ['动态权益', fmtWan(acc.equity), ''],
    ['可用资金', fmtWan(acc.available), ''],
    ['保证金占用', fmtWan(acc.marginUsed), ''],
    ['风险度', acc.risk.toFixed(1) + '%', acc.risk > 80 ? 'down' : ''],
    ['当日盈亏', fmtSign(acc.dayPnl, 0), cls(acc.dayPnl)],
    ['累计盈亏', fmtSign(acc.realizedTotal, 0), cls(acc.realizedTotal)],
    ['手续费累计', acc.feesTotal.toFixed(0), ''],
  ];
  $('#account-strip').innerHTML = items.map(([k, v, c]) =>
    `<div class="acct-item"><span class="k">${k}</span><span class="v ${c}">${v}</span></div>`).join('');
  $('#sb-risk').textContent = acc.risk > 0 ? `风险度 ${acc.risk.toFixed(1)}%` : '';
  $('#sb-risk').className = `mono ${acc.risk > 80 ? 'down' : ''}`;
}

// —— 四个 tab ————————————————————————————————————
export function renderSummary(s) {
  summary = s;
  window.__fdSummary = s;
  renderAccountStrip(s.account);
  renderPositions(s.positions);
  renderOrders(s);
  renderTrades(s.recentTrades);
  renderCashflow(s.cashflow);
}

function renderPositions(positions) {
  const el = $('#tab-pos');
  $('#btn-close-all').style.visibility = positions.length ? 'visible' : 'hidden';
  if (!positions.length) { el.innerHTML = '<div class="empty-tip">暂无持仓</div>'; return; }
  el.innerHTML = positions.map(p => {
    const exp = expandedPos === p.code;
    return `
    <div class="trow">
      <div class="trow-top">
        <span class="pos-badge ${p.dir === 'short' ? 'short' : ''}">${p.dir === 'long' ? '多' : '空'}</span>
        <b>${p.name}</b><span class="muted mono">${p.qty}手 · 均价${fmt(p.avgCost, p.digits)}</span>
        <span class="grow"></span>
        <span class="mono ${cls(p.floatPnl)}">${fmtSign(p.floatPnl, 0)}</span>
      </div>
      <div class="trow-top muted">
        <span>现价 ${fmt(p.last, p.digits)}</span>
        <span>占用 ${fmtWan(p.margin)}</span>
        ${p.sl ? `<span>止损 ${fmt(p.sl, p.digits)}</span>` : ''}
        ${p.tp ? `<span>止盈 ${fmt(p.tp, p.digits)}</span>` : ''}
      </div>
      <div class="trow-actions">
        <button data-act="close" data-code="${p.code}">平仓</button>
        <button data-act="reverse" data-code="${p.code}">反手</button>
        <button data-act="sltp" data-code="${p.code}">止盈止损</button>
      </div>
      ${exp ? `
      <div class="trow" style="border:1px dashed var(--line);border-radius:6px;margin-top:4px">
        <div class="ord-grid" style="padding:8px 0 0">
          <label>止损价 <input id="sltp-sl" type="number" step="any" value="${p.sl ?? ''}"></label>
          <label>止盈价 <input id="sltp-tp" type="number" step="any" value="${p.tp ?? ''}"></label>
        </div>
        <div class="trow-actions" style="padding:8px 0">
          <button data-act="sltp-save" data-code="${p.code}">保存</button>
          <button data-act="sltp-cancel">取消</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

$('#tab-pos')?.addEventListener?.('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const code = btn.dataset.code;
  const act = btn.dataset.act;
  if (act === 'close') { const r = engine.closePosition(code); showMsg(r.ok ? '平仓已提交' : r.msg, !r.ok); }
  else if (act === 'reverse') { const r = engine.reverse(code); showMsg(r.ok ? '反手已提交' : r.msg, !r.ok); }
  else if (act === 'sltp') { expandedPos = expandedPos === code ? null : code; renderPositions(summary?.positions || []); return; }
  else if (act === 'sltp-cancel') { expandedPos = null; renderPositions(summary?.positions || []); return; }
  else if (act === 'sltp-save') {
    const sl = parseFloat(document.getElementById('sltp-sl')?.value) || 0;
    const tp = parseFloat(document.getElementById('sltp-tp')?.value) || 0;
    const r = engine.setSltp(code, sl, tp);
    if (r.ok) { expandedPos = null; showMsg('止盈止损已更新'); }
  }
  refreshSummary();
});

function renderOrders(s) {
  const el = $('#tab-ord');
  const list = s.orders || [];
  if (!list.length) { el.innerHTML = '<div class="empty-tip">暂无委托</div>'; return; }
  el.innerHTML = list.map(o => {
    const statusMap = { pending: '待成交', filled: '已成交', canceled: '已撤单', rejected: '已拒绝' };
    return `
    <div class="trow">
      <div class="trow-top">
        <b>${o.name}</b>
        <span>${o.dir === 'buy' ? '买' : '卖'}${o.offset === 'open' ? '开' : '平'}</span>
        <span class="mono">${o.type === 'market' ? '市价' : '限价 ' + o.price}</span>
        <span class="mono">${o.qty}手</span>
        <span class="grow"></span>
        <span class="muted">${statusMap[o.status] || o.status}${o.kind === 'condition' ? ` · 条件触发${o.trigger}` : ''}</span>
      </div>
      <div class="trow-top muted">
        <span>${o.ts}</span>
        ${o.note ? `<span>${o.note}</span>` : ''}
        ${o.fillPrice ? `<span>成交 @ ${o.fillPrice}</span>` : ''}
        <span class="grow"></span>
        ${o.status === 'pending' ? `<button data-cancel="${o.id}">撤单</button>` : ''}
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => {
    const r = engine.cancel(+b.dataset.cancel);
    if (!r.ok) showMsg(r.msg, true);
    refreshSummary();
  }));
}

function renderTrades(trades) {
  const el = $('#tab-trd');
  if (!trades?.length) { el.innerHTML = '<div class="empty-tip">暂无成交</div>'; return; }
  el.innerHTML = trades.map(t => `
    <div class="trow">
      <div class="trow-top">
        <b>${t.name}</b>
        <span>${t.dir === 'buy' ? '买' : '卖'}${t.offset === 'open' ? '开' : '平'}</span>
        <span class="mono">${t.qty}手 @ ${t.price}</span>
        <span class="grow"></span>
        ${t.pnl != null ? `<span class="mono ${cls(t.pnl)}">${fmtSign(t.pnl, 0)}</span>` : `<span class="muted mono">费${t.fee}</span>`}
      </div>
      <div class="trow-top muted"><span>${t.ts}</span></div>
    </div>`).join('');
}

function renderCashflow(flow) {
  const el = $('#cashflow-list');
  if (!flow?.length) { el.innerHTML = '<div class="empty-tip">暂无流水</div>'; return; }
  el.innerHTML = flow.map(f => `
    <div class="cf-row">
      <span class="muted">${f.t}</span>
      <span>${f.type} · ${f.detail}</span>
      <span class="amt ${cls(f.amount)}">${f.amount ? fmtSign(f.amount, 0) : '--'}</span>
    </div>`).join('');
}

function drawEquity() {
  const canvas = $('#eq-canvas');
  const curve = summary?.equityCurve || [];
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 500, h = 90;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (curve.length < 2) {
    ctx.fillStyle = '#9b9b9b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('资金曲线(交易后生成)', w / 2, h / 2);
    return;
  }
  const vs = curve.map(p => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad, hi = max + pad;
  const x = i => 4 + (i / (curve.length - 1)) * (w - 8);
  const y = v => h - 8 - ((v - lo) / (hi - lo)) * (h - 16);
  // 初始资金基准线
  const base = summary.account.initialCapital;
  if (base >= lo && base <= hi) {
    ctx.strokeStyle = '#d5d5d5'; ctx.setLineDash([3, 3]); ctx.beginPath();
    ctx.moveTo(0, y(base)); ctx.lineTo(w, y(base)); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.beginPath();
  curve.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)));
  ctx.stroke();
  const last = curve[curve.length - 1].v;
  ctx.fillStyle = last >= base ? '#111' : '#777';
  ctx.font = '10px ui-monospace'; ctx.textAlign = 'right';
  ctx.fillText(fmtWan(last), w - 6, y(last) - 4);
}

export function refreshSummary() {
  renderSummary(engine.summary());
}

on('quotes', () => { if (summary) renderAccountStrip(summary.account); });
