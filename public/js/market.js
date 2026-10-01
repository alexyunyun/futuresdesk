// 行情数据源(浏览器直连,无后端,全部走新浪 JSONP,免 Referer):
// 实时行情 = 期货服务中心 Market_Center.getHQFuturesData(按品种节点,一次返回该品种全部合约)
// K线 = 新浪期货 InnerFuturesNewService(jsonp.php 路径内嵌回调变量名)
// 资讯 = 新浪滚动新闻(callback 参数)
// AI = DeepSeek 官方接口(浏览器直连,官方支持跨域)
import { jsonp } from './jsonp.js';
import { PRODUCTS } from './config.js';

// —— 实时行情 ————————————————————————————————————
const nodeCache = new Map();      // sym -> { rows: [quote...], ts }
const NODE_TTL = 2500;

// "JM0"/"SA610"/"IM0" + exchange → 全站统一的 sina 合约代码
function codeFromSymbol(exch, symbol) {
  const m = symbol.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  let digits = m[2];
  if (exch === 'czce' && digits.length === 3) digits = '2' + digits;
  const prefix = exch === 'cffex' ? 'CFF_RE_' : 'nf_';
  return prefix + m[1].toUpperCase() + digits;
}

function normRow(r) {
  const code = codeFromSymbol(r.exchange, r.symbol);
  if (!code) return null;
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const last = num(r.trade) ?? num(r.close);
  if (last == null) return null;
  const preSettle = num(r.presettlement) ?? num(r.prevsettlement);
  return {
    code, last,
    open: num(r.open), high: num(r.high), low: num(r.low),
    settle: num(r.settlement), preSettle,
    bid: num(r.bidprice1), ask: num(r.askprice1),
    bidVol: num(r.bidvol1), askVol: num(r.askvol1),
    volume: num(r.volume), openInterest: num(r.position),
    change: preSettle ? +(last - preSettle).toFixed(4) : 0,
    changePct: r.changepercent != null ? +(r.changepercent * 100).toFixed(2) : 0,
    date: r.tradedate || null, time: (r.ticktime || '').slice(0, 8) || null,
    trading: true, avg: null,
  };
}

async function fetchNode(p) {
  const v = `fdq${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const rows = await jsonp(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/${v}=/Market_Center.getHQFuturesData?node=${p.node}`,
    v,
  );
  if (!Array.isArray(rows)) throw new Error('行情数据为空');
  const list = rows.map(normRow).filter(Boolean);
  if (list.length) nodeCache.set(p.sym, { rows: list, ts: Date.now() });
  return list;
}

// 拉取一组品种的行情(内部按 2.5s TTL 去重);返回 code -> quote
export async function pollQuotes(needSyms) {
  const now = Date.now();
  const jobs = [];
  for (const sym of needSyms) {
    const p = PRODUCTS.find(x => x.sym === sym);
    if (!p) continue;
    const c = nodeCache.get(sym);
    if (!c || now - c.ts > NODE_TTL) jobs.push(fetchNode(p).catch(() => {}));
  }
  if (jobs.length) await Promise.all(jobs);
  const out = {};
  for (const sym of needSyms) {
    const c = nodeCache.get(sym);
    if (!c) continue;
    for (const q of c.rows) out[q.code] = q;
  }
  return out;
}

// —— K线 ——————————————————————————————————————————
const klineCache = new Map();
const K_PERIODS = ['1', '5', '15', '30', '60', 'daily', 'week'];

export async function fetchKline(sinaSymbol, period = 'daily') {
  if (!K_PERIODS.includes(period)) throw new Error('不支持的周期');
  const key = `${sinaSymbol}|${period}`;
  const ttl = period === 'daily' || period === 'week' ? 300000 : 20000;
  const hit = klineCache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;

  const v = `fdk${Date.now().toString(36)}`;
  const service = (period === 'daily' || period === 'week')
    ? 'InnerFuturesNewService.getDailyKLine'
    : `InnerFuturesNewService.getFewMinLine?type=${period}`;
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/${v}=/${service}&symbol=${sinaSymbol}`;
  const arr = await jsonp(url, v);
  if (!Array.isArray(arr)) throw new Error('K线数据为空');
  let data = arr.map(it => ({ t: it.d, o: +it.o, h: +it.h, l: +it.l, c: +it.c, v: +it.v || 0, oi: +it.p || 0 }));
  if (period === 'daily') data = data.slice(-900);
  if (period === 'week') data = aggregateWeekly(data);
  klineCache.set(key, { data, ts: Date.now() });
  return data;
}

function aggregateWeekly(daily) {
  const out = [];
  let cur = null;
  for (const d of daily) {
    const dt = new Date(d.t);
    const wk = mondayOf(dt);
    if (!cur || cur.t !== wk) {
      if (cur) out.push(cur);
      cur = { t: wk, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v, oi: d.oi };
    } else {
      cur.h = Math.max(cur.h, d.h); cur.l = Math.min(cur.l, d.l);
      cur.c = d.c; cur.v += d.v; cur.oi = d.oi;
    }
  }
  if (cur) out.push(cur);
  return out;
}
function mondayOf(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}

// —— 合约列表:直接取品种节点数据里的月份合约 ————————————————————
export async function fetchContracts(p) {
  try {
    let c = nodeCache.get(p.sym);
    if (!c) await fetchNode(p);
    c = nodeCache.get(p.sym);
    const out = [];
    for (const q of (c?.rows || [])) {
      const m = q.code.match(/(\d{3,4})$/);
      if (!m || q.code === p.sina) continue;
      out.push({ sina: q.code, label: m[1] });
    }
    return out.slice(0, 12);
  } catch {
    return [];
  }
}

// —— 资讯 ——————————————————————————————————————————
let newsCache = { data: null, ts: 0 };
export async function fetchNews() {
  if (newsCache.data && Date.now() - newsCache.ts < 120000) return newsCache.data;
  const v = `fdn${Date.now().toString(36)}`;
  const r = await jsonp(`https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=50&page=1&callback=${v}`, v);
  const items = (r?.result?.data || []).map(it => ({
    title: it.title,
    url: it.url || it.wapurl,
    time: it.ctime ? new Date(it.ctime * 1000).toLocaleString('zh-CN', { hour12: false }) : '',
    source: it.media_name || '新浪财经',
  }));
  if (items.length) { newsCache.data = items; newsCache.ts = Date.now(); }
  return items;
}

// —— DeepSeek(浏览器直连,官方支持跨域) ————————————————————
export async function deepseekChat({ apiKey, model, messages }) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `DeepSeek 接口错误 (${res.status})`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* keep */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.body;
}

export async function deepseekTest({ apiKey, model }) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4, stream: false }),
  });
  if (res.ok) return { ok: true, msg: '连接成功,API Key 有效' };
  const t = await res.text().catch(() => '');
  let msg = `错误 ${res.status}`;
  try { msg = JSON.parse(t)?.error?.message || msg; } catch { /* keep */ }
  throw new Error(msg);
}
