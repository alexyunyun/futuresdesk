// 共享状态 + 格式化工具
import { PRODUCTS, GROUPS, digitsOf } from './config.js';

export const state = {
  products: [],            // 品种配置(含 digits)
  productMap: new Map(),   // sina code -> product
  groups: GROUPS,
  quotes: {},              // code -> quote
  selected: localStorage.getItem('fd.selected') || 'nf_RB0',
  watchlist: JSON.parse(localStorage.getItem('fd.watchlist') || '["nf_RB0","nf_CU0","nf_AU0","nf_AG0","nf_I0","nf_M0","nf_LC0","CFF_RE_IF0"]'),
  wlTab: 'all',
  listeners: {},
};

export const settings = {
  get apiKey() { return localStorage.getItem('fd.apiKey') || ''; },
  set apiKey(v) { v ? localStorage.setItem('fd.apiKey', v) : localStorage.removeItem('fd.apiKey'); },
  get model() { return localStorage.getItem('fd.model') || 'deepseek-chat'; },
  set model(v) { localStorage.setItem('fd.model', v); },
  get color() { return localStorage.getItem('fd.color') || 'mono'; },
  set color(v) { localStorage.setItem('fd.color', v); applyColor(); emit('colorChanged', v); },
  get pollMs() { return +(localStorage.getItem('fd.poll') || 3000); },
  set pollMs(v) { localStorage.setItem('fd.poll', v); emit('pollMs', v); },
};
export function applyColor() { document.body.classList.toggle('rg', settings.color === 'rg'); }

export function on(evt, fn) { (state.listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { (state.listeners[evt] || []).forEach(fn => fn(data)); }

// 轻提示
export function toast(text, isErr = false) {
  let el = document.getElementById('fd-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fd-toast';
    el.style.cssText = 'position:fixed;bottom:46px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 18px;border-radius:6px;font-size:12.5px;z-index:99;transition:opacity .3s;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.fontWeight = isErr ? '600' : '400';
  el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
}

export function setSelected(code) {
  state.selected = code;
  localStorage.setItem('fd.selected', code);
  emit('select', code);
}

// —— 格式化 ————————————————————————————————————
export function fmt(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '--';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtSign(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '--';
  return (v > 0 ? '+' : '') + fmt(v, digits);
}
export function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '--';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '';
  return `${arrow}${Math.abs(v).toFixed(2)}%`;
}
export function cls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }
export function fmtWan(v) {
  if (v == null || Number.isNaN(v)) return '--';
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (v / 1e4).toFixed(2) + '万';
  return v.toFixed(0);
}
export function digitsOfCode(code) {
  const p = state.productMap.get(code);
  return p ? p.digits : 0;
}

export function sessionInfo() {
  // 粗略交易时段判断(不含节假日):日盘 09:00-10:15 / 10:30-11:30 / 13:30-15:00,中金所 09:30-11:30 / 13:00-15:15,夜盘 21:00-23:00
  const d = new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return { open: false, label: '周末休市' };
  const hm = d.getHours() * 100 + d.getMinutes();
  const dayOpen = (hm >= 900 && hm <= 1015) || (hm >= 1030 && hm <= 1130) || (hm >= 1330 && hm <= 1500);
  const cffOpen = (hm >= 930 && hm <= 1130) || (hm >= 1300 && hm <= 1515);
  const nightOpen = hm >= 2100 || hm <= 230;
  const open = dayOpen || cffOpen || nightOpen;
  return { open, label: open ? '交易时段' : '休市时段' };
}

// 品种配置本地初始化
export function loadProducts() {
  state.products = PRODUCTS.map(p => ({ ...p, digits: digitsOf(p.tick) }));
  state.productMap = new Map(state.products.map(p => [p.sina, p]));
}
