// 设置:DeepSeek Key / 交易参数 / 显示
import { settings, toast } from './store.js';
import { engine } from './engine.js';
import { deepseekTest } from './market.js';

const $ = s => document.querySelector(s);

export function initSettings() {
  $('#set-apikey').value = settings.apiKey;
  $('#set-model').value = settings.model;
  $('#set-color').value = settings.color;
  $('#set-poll').value = String(settings.pollMs);
  $('#set-fee').value = engine.settings.feeFactor;
  $('#set-marginf').value = engine.settings.marginFactor;
  $('#set-capital').value = engine.settings.initialCapital;

  $('#set-save-ai').addEventListener('click', () => {
    settings.apiKey = $('#set-apikey').value.trim();
    settings.model = $('#set-model').value;
    const tag = document.getElementById('ai-model-tag');
    if (tag) tag.textContent = settings.model;
    toast(settings.apiKey ? 'API Key 已保存' : '已清空 API Key');
  });
  $('#set-test').addEventListener('click', async () => {
    const key = $('#set-apikey').value.trim();
    toast('测试连接中…');
    try {
      const r = await deepseekTest({ apiKey: key, model: $('#set-model').value });
      toast(r.msg || '连接成功');
    } catch (e) { toast(e.message, true); }
  });

  $('#set-save-display').addEventListener('click', () => {
    settings.color = $('#set-color').value;
    settings.pollMs = +$('#set-poll').value;
    toast('显示设置已保存');
  });

  $('#set-save-trade').addEventListener('click', () => {
    engine.updateSettings({
      feeFactor: +$('#set-fee').value || 1,
      marginFactor: +$('#set-marginf').value || 1,
    });
    toast('交易参数已保存');
  });
  $('#set-reset').addEventListener('click', () => {
    const cap = +$('#set-capital').value;
    if (!cap || cap <= 0) { toast('请填写有效的初始资金', true); return; }
    if (!confirm(`确认重置账户?所有持仓、委托、记录将清空,初始资金设为 ${cap} 元。`)) return;
    engine.reset(cap);
    toast('账户已重置');
  });
}
