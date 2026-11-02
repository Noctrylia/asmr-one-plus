/*! 网站接入与通用 DOM 工具。当前依赖 Vue 2 的 #q-app.__vue__，网站升级框架时需先检查此处。 */
const LOG_PREFIX = '[asmr.one plus]';

const log = (...args) => console.log(LOG_PREFIX, ...args);

// 页面组件挂在网站自己的 window 上，脚本管理器的隔离环境不一定能直接读取。
const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

const SITE_API_KEYS = Object.freeze({
  'asmr.one': 'original',
  'asmr-100.com': 'mirror-100',
  'asmr-200.com': 'mirror-200',
  'asmr-300.com': 'mirror-300',
});

const siteHost = pageWindow.location.hostname.toLowerCase().replace(/^www\./, '');

function waitForApp(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      const el = pageWindow.document.querySelector('#q-app');
      const vm = el && el.__vue__;
      if (vm && vm.$store) return resolve(vm);
      if (Date.now() - started > timeoutMs) return reject(new Error('找不到 #q-app 的 Vue 实例'));
      setTimeout(poll, 200);
    })();
  });
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function el(tag, attrs = {}, children = []) {
  const node = pageWindow.document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  // append 会将字符串作为文本处理；作品名、关注名和导入文本不作为 HTML 插入。
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

function notify(vm, message) {
  if (vm.$q && typeof vm.$q.notify === 'function') {
    vm.$q.notify({ message, position: 'bottom-right', timeout: 2500 });
  } else {
    log(message);
  }
}

export { LOG_PREFIX, SITE_API_KEYS, el, formatTime, log, notify, pageWindow, siteHost, waitForApp };
