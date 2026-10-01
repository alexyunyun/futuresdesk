// 资讯:新浪滚动新闻(浏览器 JSONP 直连)
import { fetchNews } from './market.js';

const $ = s => document.querySelector(s);
let items = [];

export function initNews() {
  $('#news-refresh').addEventListener('click', load);
  $('#news-search').addEventListener('input', render);
  load();
  setInterval(load, 5 * 60 * 1000);
}

export async function load() {
  try {
    items = await fetchNews();
    if (!Array.isArray(items)) items = [];
  } catch { items = []; }
  render();
}

function render() {
  const q = ($('#news-search').value || '').trim().toLowerCase();
  const list = q ? items.filter(n => n.title.toLowerCase().includes(q)) : items;
  $('#news-list').innerHTML = list.map(n => `
    <div class="news-row">
      <span class="news-time">${(n.time || '').slice(5, 16)}</span>
      <a href="${n.url}" target="_blank" rel="noopener">${n.title}</a>
      <span class="news-src">${n.source || ''}</span>
    </div>`).join('') || '<div class="empty-tip">暂无资讯</div>';
}
