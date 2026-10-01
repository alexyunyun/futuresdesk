// AI 助手:DeepSeek 流式对话 + 上下文注入(浏览器直连,DeepSeek 官方支持跨域)
import { state, settings, on, fmt, fmtSign, fmtPct, cls, fmtWan } from './store.js';
import { deepseekChat } from './market.js';
import { getContract } from './chart.js';

const $ = s => document.querySelector(s);
const messages = [];   // {role, content}
let busy = false;

export function initAI() {
  $('#ai-send').addEventListener('click', send);
  $('#ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.querySelectorAll('#ai-chips button').forEach(b => b.addEventListener('click', () => {
    $('#ai-input').value = b.dataset.q;
    send();
  }));
  $('#ai-model-tag').textContent = settings.model;
  on('quotes', renderContext);
  on('summary', renderContext);
  if (!settings.apiKey) {
    addMsg('bot', '你好,我是接入 DeepSeek 的期货分析助手。开始前请先到「设置」填写 DeepSeek API Key(仅保存在本机浏览器)。\n\n上方快捷按钮可以让我:解读行情 / 技术面分析 / 持仓诊断 / 聊聊资金管理。');
  }
}

function addMsg(role, text, isErr = false) {
  const wrap = document.createElement('div');
  wrap.className = `ai-msg ${role === 'user' ? 'user' : 'bot'}`;
  if (isErr) wrap.innerHTML = `<div class="ai-err">${text}</div>`;
  else wrap.textContent = text;
  $('#ai-messages').appendChild(wrap);
  $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight;
  return wrap;
}

function buildContext() {
  const parts = [];
  if ($('#ctx-market').checked) {
    const code = getContract();
    const p = state.productMap.get(code);
    const q = state.quotes[code];
    if (p && q) {
      parts.push(`当前查看合约:${p.name}(${p.exch} ${code === p.sina ? '主力连续' : code})`);
      parts.push(`最新 ${q.last} 涨跌 ${fmtSign(q.change, p.digits)}(${fmtPct(q.changePct)}) 开 ${q.open} 高 ${q.high} 低 ${q.low} 昨结 ${q.preSettle}`);
      parts.push(`成交量 ${q.volume} 持仓量 ${q.openInterest}${q.avg ? ` 均价 ${q.avg}` : ''}`);
    }
  }
  if ($('#ctx-positions').checked) {
    const s = window.__fdSummary;
    if (s) {
      const a = s.account;
      parts.push(`模拟账户:动态权益 ${fmtWan(a.equity)},可用 ${fmtWan(a.available)},保证金占用 ${fmtWan(a.marginUsed)},风险度 ${a.risk}%,当日盈亏 ${a.dayPnl}`);
      if (s.positions.length) {
        parts.push('当前持仓:' + s.positions.map(p =>
          `${p.name} ${p.dir === 'long' ? '多' : '空'}${p.qty}手 成本${p.avgCost} 现价${p.last} 浮盈${p.floatPnl}${p.sl ? ` 止损${p.sl}` : ''}${p.tp ? ` 止盈${p.tp}` : ''}`).join(';'));
      } else parts.push('当前无持仓。');
    }
  }
  return parts.length ? `\n\n[本地模拟盘上下文]\n${parts.join('\n')}` : '';
}

function renderContext() {
  const el = $('#ai-context');
  const code = getContract();
  const p = state.productMap.get(code);
  const q = state.quotes[code];
  const s = window.__fdSummary;
  const lines = [];
  if (p && q) lines.push(`${p.name} ${q.last} ${fmtPct(q.changePct)}  量${q.volume} 存${q.openInterest}`);
  if (s) lines.push(`权益 ${fmtWan(s.account.equity)} · 风险度 ${s.account.risk}% · 持仓 ${s.positions.length} 个`);
  el.textContent = lines.join('\n') || '等待行情…';
}

async function send() {
  if (busy) return;
  const input = $('#ai-input');
  const text = input.value.trim();
  if (!text) return;
  if (!settings.apiKey) {
    addMsg('bot', '尚未配置 DeepSeek API Key。请到「设置」填写后回来重试。', true);
    return;
  }
  input.value = '';
  addMsg('user', text);
  const ctx = buildContext();
  const content = text + ctx;
  messages.push({ role: 'user', content });
  const userMsgForUI = { role: 'user', content: text };
  void userMsgForUI;

  busy = true;
  $('#ai-send').disabled = true;
  const bubble = addMsg('bot', '思考中…');
  bubble.classList.add('thinking');

  try {
    const stream = await deepseekChat({
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: 'system', content: '你是一名严谨的期货市场分析与交易教练。用简体中文回答,条理清晰,重点突出。涉及交易建议时必须提示风险,说明这仅供参考不构成投资建议。' },
        ...messages,
      ],
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
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) full += delta;
        } catch { /* 忽略不完整块 */ }
      }
      if (full) { bubble.classList.remove('thinking'); bubble.textContent = full; $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight; }
    }
    if (!full) full = '(空响应)';
    bubble.textContent = full;
    messages.push({ role: 'assistant', content: full });
    if (messages.length > 24) messages.splice(0, messages.length - 24);
  } catch (e) {
    bubble.innerHTML = `<div class="ai-err">${e.message}</div>`;
    messages.pop(); // 回滚这条 user 消息,允许重试
  } finally {
    busy = false;
    $('#ai-send').disabled = false;
    $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight;
  }
}
