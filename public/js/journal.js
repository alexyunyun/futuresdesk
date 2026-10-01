// 复盘日志:交易统计 + 手写日志 + AI 点评(浏览器 localStorage 持久化)
import { settings, cls, fmtSign, fmtWan } from './store.js';
import { engine } from './engine.js';
import { deepseekChat } from './market.js';

const $ = s => document.querySelector(s);
const LS_KEY = 'fd.journal.v1';
let entries = [];

export function initJournal() {
  $('#j-date').value = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  $('#j-save').addEventListener('click', save);
  $('#j-ai').addEventListener('click', aiReview);
  load();
}

export function load() {
  try { entries = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { entries = []; }
  entries.sort((a, b) => b.ts - a.ts);
  renderStats();
  renderList();
}

function persist() { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 500))); }

function renderStats() {
  const closed = engine.closedStats();
  const wins = closed.filter(t => (t.pnl || 0) > 0);
  const losses = closed.filter(t => (t.pnl || 0) < 0);
  const winRate = closed.length ? (wins.length / closed.length * 100) : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const plRatio = avgLoss ? (avgWin / avgLoss) : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalFee = closed.reduce((s, t) => s + (t.fee || 0), 0);
  const boxes = [
    ['平仓次数', closed.length, ''],
    ['胜率', closed.length ? winRate.toFixed(0) + '%' : '--', winRate >= 50 ? 'up' : ''],
    ['盈亏比', plRatio ? plRatio.toFixed(2) : '--', ''],
    ['平仓累计盈亏', fmtSign(totalPnl, 0), cls(totalPnl)],
    ['平均盈利', fmtWan(avgWin), ''],
    ['平均亏损', fmtWan(avgLoss), ''],
    ['累计手续费', totalFee.toFixed(0), ''],
  ];
  $('#journal-stats').innerHTML = boxes.map(([k, v, c]) =>
    `<div class="stat-box acct-item"><span class="k">${k}</span><span class="v small-v ${c}">${v}</span></div>`).join('');
}

function renderList() {
  $('#journal-list').innerHTML = entries.map(e => `
    <div class="j-entry">
      <h4>${escapeHtml(e.title || '(无标题)')}<span class="j-date">${e.date}</span>
        <button class="j-del" data-ts="${e.ts}">删除</button></h4>
      <p>${escapeHtml(e.content)}</p>
    </div>`).join('') || '<div class="empty-tip">还没有复盘记录,从左边写下第一篇吧</div>';
  document.querySelectorAll('.j-del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('删除这条复盘?')) return;
    entries = entries.filter(e => e.ts !== +b.dataset.ts);
    persist();
    load();
  }));
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function save() {
  const date = $('#j-date').value;
  const title = $('#j-title').value.trim();
  const content = $('#j-content').value.trim();
  if (!date || !content) { alert('请填写日期和内容'); return; }
  entries.unshift({ ts: Date.now(), date, title, content });
  persist();
  $('#j-title').value = ''; $('#j-content').value = '';
  load();
}

async function aiReview() {
  const content = $('#j-content').value.trim();
  if (!settings.apiKey) { alert('请先在「设置」中填写 DeepSeek API Key'); return; }
  if (!content) { alert('请先写下今天的复盘内容'); return; }
  const out = $('#j-ai-out');
  out.style.display = 'block';
  out.textContent = 'AI 点评中…';
  try {
    const a = engine.account();
    let stats = `\n\n[账户数据] 动态权益${a.equity} 当日盈亏${a.dayPnl} 累计盈亏${a.realizedTotal} 风险度${a.risk}%`;
    const positions = engine.positionList();
    if (positions.length) stats += `\n当前持仓:${positions.map(p => `${p.name}${p.dir === 'long' ? '多' : '空'}${p.qty}手 浮盈${p.floatPnl}`).join(';')}`;
    const history = entries.slice(0, 5).map(e => `${e.date}:${e.title}`).join('\n');
    const stream = await deepseekChat({
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [{
        role: 'user',
        content: `你是一名期货交易教练。请点评下面这篇交易复盘,指出问题、给出具体可执行的改进建议(3-5条),语气直接但建设性。最后提醒风险。${stats}\n\n近期复盘标题:\n${history}\n\n今日复盘:\n${content}`,
      }],
    });
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try { full += JSON.parse(payload).choices?.[0]?.delta?.content || ''; } catch { /* 忽略 */ }
      }
      out.textContent = full || 'AI 点评中…';
    }
    out.textContent = full || '(空响应)';
  } catch (e) {
    out.textContent = `点评失败:${e.message}`;
  }
}
