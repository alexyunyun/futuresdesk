// 模拟交易引擎(浏览器版):资金 / 持仓 / 委托 / 成交 / 止盈止损 / 条件单 / 风险度强平
// 纯本地模拟撮合:限价单按"最新价穿越委托价"成交,市价单按最新价成交
// 状态持久化在浏览器 localStorage
import { parseCode, digitsOf } from './config.js';

const LS_KEY = 'fd.engine.v1';
const MAX_ORDERS = 300, MAX_TRADES = 500, MAX_FLOW = 500, MAX_CURVE = 2000;

function nowStr(d = new Date()) {
  return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-');
}
function ts() { return Date.now(); }
function round2(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function freshState(capital) {
  return {
    settings: { initialCapital: capital || 1000000, feeFactor: 1, marginFactor: 1 },
    initialCapital: capital || 1000000,
    realizedTotal: 0, feesTotal: 0, realizedToday: 0, feesToday: 0, day: null,
    positions: {}, orders: [], trades: [],
    cashflow: [{ t: nowStr(), ts: ts(), type: '入金', detail: '初始资金', amount: capital || 1000000 }],
    equityCurve: [], seq: 1,
  };
}

class Engine {
  constructor() {
    this.state = null;
    this.latest = {};
    this._saveTimer = null;
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      this.state = (s && s.positions && s.settings) ? s : freshState();
    } catch { this.state = freshState(); }
  }

  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); }
      catch (e) { console.error('保存交易状态失败', e); }
    }, 400);
  }

  get settings() { return this.state.settings; }

  // —— 行情驱动 ————————————————————————————————————
  onQuotes(quotes) {
    this.latest = { ...this.latest, ...quotes };
    const anyQ = Object.values(quotes)[0];
    if (anyQ?.date && anyQ.date !== this.state.day) {
      this.state.day = anyQ.date;
      this.state.realizedToday = 0; this.state.feesToday = 0;
    }
    this.matchOrders();
    this.checkStopLoss();
    this.checkRisk();
    this.recordEquity();
    this.save();
  }

  lastPrice(code) { return this.latest[code]?.last ?? null; }

  // —— 账户 ————————————————————————————————————————
  account() {
    const st = this.state;
    let floating = 0, marginUsed = 0;
    const positions = this.positionList();
    for (const p of positions) { floating += p.floatPnl; marginUsed += p.margin; }
    const equity = st.initialCapital + st.realizedTotal + floating - st.feesTotal;
    const available = equity - marginUsed;
    const risk = equity > 0 ? (marginUsed / equity) * 100 : (marginUsed > 0 ? 999 : 0);
    const dayPnl = floating + st.realizedToday - st.feesToday;
    return {
      equity: round2(equity), available: round2(available), marginUsed: round2(marginUsed),
      floating: round2(floating), risk: round2(risk), dayPnl: round2(dayPnl),
      realizedTotal: round2(st.realizedTotal), feesTotal: round2(st.feesTotal),
      initialCapital: st.initialCapital,
    };
  }

  positionList() {
    const out = [];
    for (const p of Object.values(this.state.positions)) {
      const last = this.lastPrice(p.code) ?? p.avgCost;
      const dirSign = p.dir === 'long' ? 1 : -1;
      const floatPnl = (last - p.avgCost) * p.mult * p.qty * dirSign;
      const margin = last * p.mult * p.qty * p.marginRate * this.settings.marginFactor;
      out.push({ ...p, last, floatPnl: round2(floatPnl), margin: round2(margin) });
    }
    return out;
  }

  // —— 下单 ————————————————————————————————————————
  placeOrder(req) {
    const { code, dir, offset, type = 'limit', price, qty } = req;
    const parsed = parseCode(code);
    if (!parsed) return { ok: false, msg: '未知合约' };
    const p = parsed.product;
    const n = parseInt(qty, 10);
    if (!n || n <= 0) return { ok: false, msg: '手数无效' };
    if (dir !== 'buy' && dir !== 'sell') return { ok: false, msg: '方向无效' };
    const last = this.lastPrice(code);
    if (offset === 'close') {
      const pos = this.state.positions[code];
      if (!pos) return { ok: false, msg: '无持仓可平' };
      if (pos.dir === (dir === 'buy' ? 'long' : 'short')) return { ok: false, msg: '平仓方向与持仓不符' };
      if (n > pos.qty) return { ok: false, msg: `平仓手数超过持仓 ${pos.qty} 手` };
    }
    let px = price != null && price > 0 ? +price : null;
    if (type === 'limit' && !px) return { ok: false, msg: '限价单需填写价格' };
    if (type === 'market') px = null;

    const order = {
      id: this.state.seq++, ts: nowStr(), tsMs: ts(), code, sym: p.sym, name: p.name,
      dir, offset, type, price: px, qty: n,
      kind: req.kind || 'normal',
      trigger: req.trigger ?? null,
      sl: req.sl ?? null, tp: req.tp ?? null,
      status: 'pending', note: '', fillPrice: null, fillTs: null, pnl: null,
    };
    if (order.kind === 'condition' && !order.trigger) return { ok: false, msg: '条件单需设置触发价' };

    if (type === 'market' && order.kind === 'normal') {
      if (last == null) { order.status = 'rejected'; order.note = '无行情,无法成交'; this.pushOrder(order); return { ok: false, msg: order.note }; }
      this.fill(order, last);
    } else {
      if (offset === 'open' && type === 'limit') {
        const need = px * p.mult * n * p.margin * this.settings.marginFactor;
        const acc = this.account();
        if (need > acc.available) {
          order.status = 'rejected';
          order.note = `保证金不足(需 ${fmtWan(need)},可用 ${fmtWan(acc.available)})`;
          this.pushOrder(order);
          return { ok: false, msg: order.note };
        }
      }
      this.pushOrder(order);
    }
    this.save();
    return { ok: true, order };
  }

  pushOrder(order) {
    this.state.orders.unshift(order);
    if (this.state.orders.length > MAX_ORDERS) this.state.orders.length = MAX_ORDERS;
  }

  fill(order, price) {
    const parsed = parseCode(order.code);
    const p = parsed.product;
    const st = this.state;
    order.status = 'filled'; order.fillPrice = price; order.fillTs = nowStr();
    const fee = price * p.mult * order.qty * (p.fee / 10000) * this.settings.feeFactor;
    st.feesTotal += fee; st.feesToday += fee;
    st.cashflow.unshift({ t: nowStr(), ts: ts(), type: '手续费', detail: `${p.name} ${order.qty}手`, amount: -round2(fee) });

    if (order.offset === 'open') {
      const dirKey = order.dir === 'buy' ? 'long' : 'short';
      let pos = st.positions[order.code];
      if (pos && pos.dir === dirKey) {
        pos.avgCost = (pos.avgCost * pos.qty + price * order.qty) / (pos.qty + order.qty);
        pos.qty += order.qty;
        if (order.sl) pos.sl = order.sl;
        if (order.tp) pos.tp = order.tp;
      } else if (pos) {
        pos.qty -= order.qty;
        if (pos.qty === 0) delete st.positions[order.code];
      } else {
        st.positions[order.code] = {
          code: order.code, sym: p.sym, name: p.name, dir: dirKey, qty: order.qty,
          avgCost: price, mult: p.mult, marginRate: p.margin, digits: digitsOf(p.tick),
          openTs: nowStr(), sl: order.sl ?? null, tp: order.tp ?? null,
        };
      }
      st.cashflow.unshift({ t: nowStr(), ts: ts(), type: '开仓', detail: `${p.name} ${order.dir === 'buy' ? '买' : '卖'}${order.qty}手 @${price}`, amount: 0 });
    } else {
      const pos = st.positions[order.code];
      if (!pos) { order.status = 'rejected'; order.note = '持仓已不存在'; }
      else {
        const dirSign = pos.dir === 'long' ? 1 : -1;
        const pnl = (price - pos.avgCost) * p.mult * order.qty * dirSign;
        st.realizedTotal += pnl; st.realizedToday += pnl;
        pos.qty -= order.qty;
        if (pos.qty <= 0) delete st.positions[order.code];
        st.cashflow.unshift({ t: nowStr(), ts: ts(), type: '平仓', detail: `${p.name} 平${order.qty}手 @${price}`, amount: round2(pnl) });
        order.pnl = round2(pnl);
      }
    }
    st.trades.unshift({
      id: order.id, ts: order.fillTs, tsMs: ts(), code: order.code, name: p.name,
      dir: order.dir, offset: order.offset, price, qty: order.qty, fee: round2(fee),
      pnl: order.offset === 'close' ? (order.pnl ?? null) : null,
    });
    if (st.trades.length > MAX_TRADES) st.trades.length = MAX_TRADES;
    if (st.cashflow.length > MAX_FLOW) st.cashflow.length = MAX_FLOW;
  }

  matchOrders() {
    const st = this.state;
    for (const o of st.orders) {
      if (o.status !== 'pending') continue;
      const last = this.lastPrice(o.code);
      if (last == null) continue;
      if (o.kind === 'condition') {
        const trig = o.trigger;
        if (o.dir === 'buy' ? last < trig : last > trig) continue;
        o.type = 'market';
        this.fill(o, last);
        continue;
      }
      if (o.type === 'market') { this.fill(o, last); continue; }
      // 限价单:最新价穿越委托价即成交,以委托价撮合(模拟挂单排队)
      if (o.dir === 'buy' && last <= o.price) this.fill(o, o.price);
      else if (o.dir === 'sell' && last >= o.price) this.fill(o, o.price);
    }
  }

  checkStopLoss() {
    for (const pos of Object.values(this.state.positions)) {
      const last = this.lastPrice(pos.code);
      if (last == null) continue;
      let kind = null;
      if (pos.sl != null && (pos.dir === 'long' ? last <= pos.sl : last >= pos.sl)) kind = '止损';
      else if (pos.tp != null && (pos.dir === 'long' ? last >= pos.tp : last <= pos.tp)) kind = '止盈';
      if (kind == null) continue;
      const qty = pos.qty;
      const r = this.placeOrder({
        code: pos.code, dir: pos.dir === 'long' ? 'sell' : 'buy', offset: 'close',
        type: 'market', qty, kind: 'stop',
      });
      if (r.ok) {
        this.state.cashflow.unshift({
          t: nowStr(), ts: ts(), type: '触发',
          detail: `${pos.name} ${kind}价 ${kind === '止损' ? pos.sl : pos.tp} 触发,市价平 ${qty} 手`, amount: 0,
        });
      }
    }
  }

  checkRisk() {
    const acc = this.account();
    if (acc.risk <= 100 || Object.keys(this.state.positions).length === 0) return;
    for (const pos of Object.values(this.state.positions)) {
      const last = this.lastPrice(pos.code) ?? pos.avgCost;
      const order = {
        id: this.state.seq++, ts: nowStr(), tsMs: ts(), code: pos.code, sym: pos.sym, name: pos.name,
        dir: pos.dir === 'long' ? 'sell' : 'buy', offset: 'close', type: 'market',
        price: null, qty: pos.qty, kind: 'stop', trigger: null, sl: null, tp: null,
        status: 'pending', note: '', fillPrice: null, fillTs: null, pnl: null,
      };
      this.fill(order, last);
    }
    this.state.cashflow.unshift({ t: nowStr(), ts: ts(), type: '强平', detail: `风险度 ${acc.risk}% 超 100%,全部持仓强制平仓`, amount: 0 });
  }

  recordEquity() {
    const acc = this.account();
    const curve = this.state.equityCurve;
    const lastPt = curve[curve.length - 1];
    if (!lastPt || Date.now() - lastPt.ms > 5000) {
      curve.push({ t: nowStr(), ms: Date.now(), v: acc.equity });
      if (curve.length > MAX_CURVE) curve.splice(0, curve.length - MAX_CURVE);
    }
  }

  // —— 操作 ————————————————————————————————————————
  cancel(id) {
    const o = this.state.orders.find(x => x.id === id && x.status === 'pending');
    if (!o) return { ok: false, msg: '委托不存在或已成交' };
    o.status = 'canceled';
    this.save();
    return { ok: true };
  }
  closePosition(code, qty = null) {
    const pos = this.state.positions[code];
    if (!pos) return { ok: false, msg: '无持仓' };
    const n = qty ?? pos.qty;
    return this.placeOrder({ code, dir: pos.dir === 'long' ? 'sell' : 'buy', offset: 'close', type: 'market', qty: n });
  }
  closeAll() {
    let n = 0;
    for (const code of Object.keys(this.state.positions)) {
      if (this.closePosition(code).ok) n++;
    }
    return { ok: n > 0, msg: n ? `已提交 ${n} 个平仓委托` : '无持仓' };
  }
  reverse(code) {
    const pos = this.state.positions[code];
    if (!pos) return { ok: false, msg: '无持仓' };
    const dir = pos.dir, qty = pos.qty;
    const r = this.closePosition(code);
    if (!r.ok) return r;
    return this.placeOrder({ code, dir: dir === 'long' ? 'sell' : 'buy', offset: 'open', type: 'market', qty });
  }
  setSltp(code, sl, tp) {
    const pos = this.state.positions[code];
    if (!pos) return { ok: false, msg: '无持仓' };
    pos.sl = sl > 0 ? +sl : null;
    pos.tp = tp > 0 ? +tp : null;
    this.save();
    return { ok: true };
  }
  reset(capital) {
    const cap = +capital > 0 ? +capital : this.state.initialCapital;
    const st = this.state;
    st.initialCapital = cap; st.realizedTotal = 0; st.feesTotal = 0;
    st.realizedToday = 0; st.feesToday = 0; st.positions = {}; st.orders = []; st.trades = [];
    st.cashflow = [{ t: nowStr(), ts: ts(), type: '入金', detail: '重置账户,初始资金', amount: cap }];
    st.equityCurve = [];
    this.save();
    return { ok: true };
  }
  updateSettings(patch) {
    const s = this.state.settings;
    if (patch.feeFactor != null) s.feeFactor = clamp(+patch.feeFactor || 1, 0, 10);
    if (patch.marginFactor != null) s.marginFactor = clamp(+patch.marginFactor || 1, 0.1, 10);
    this.save();
    return { ok: true };
  }

  summary() {
    return {
      account: this.account(),
      positions: this.positionList(),
      pendingOrders: this.state.orders.filter(o => o.status === 'pending'),
      recentTrades: this.state.trades.slice(0, 80),
      cashflow: this.state.cashflow.slice(0, 100),
      equityCurve: this.state.equityCurve.slice(-600),
      orders: this.state.orders.slice(0, 120),
    };
  }

  closedStats() {
    return this.state.trades.filter(t => t.offset === 'close');
  }
}

function fmtWan(v) { return v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(0); }

export const engine = new Engine();
