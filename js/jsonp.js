// JSONP 加载器:通过 <script> 标签跨域取数(免 Referer,绕开浏览器 CORS 限制)
// 兼容两种回调风格:赋值式 `FDQ=([..]);` 与调用式 `try{FDN({..})}catch(e){}`
let seq = 0;

export function jsonp(url, varName, timeout = 9000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.referrerPolicy = 'no-referrer';
    const cleanup = () => { clearTimeout(timer); s.remove(); try { delete window[varName]; } catch { window[varName] = undefined; } };
    const timer = setTimeout(() => { cleanup(); reject(new Error('数据源请求超时')); }, timeout);
    s.onload = () => {
      const v = window[varName];
      cleanup();
      if (v === undefined || v === null || typeof v === 'function') reject(new Error('数据源返回为空'));
      else resolve(v);
    };
    s.onerror = () => { cleanup(); reject(new Error('数据源连接失败')); };
    window[varName] = payload => { window[varName] = payload; };
    s.src = url;
    document.head.appendChild(s);
  });
}
