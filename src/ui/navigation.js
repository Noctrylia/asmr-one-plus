/*! 网站导航适配：复用原站侧栏样式，在现有 layout 下注册脚本页面，避免丢失播放器和导航框架。 */
import { onLocaleChange } from "../core/i18n.js";
import { pageWindow } from "../core/runtime.js";

function addNavItem({ id, label, iconSvg, href = null, onClick, isActive = () => false, onInsert = () => {}, after = '/playlists' }) {
  const doc = pageWindow.document;
  const selectors = [].concat(after).map((a) => (a.startsWith('/') ? `a[href$="${a}"]` : a));

  // 只复用外观。页面入口保留真实 href，键盘激活交给浏览器；历史浮层回退则使用原生 button。
  const build = (template) => {
    const item = doc.createElement(href ? 'a' : 'button');
    for (const { name, value } of template.attributes) {
      if (!['href', 'role', 'tabindex', 'type', 'id', 'aria-current', 'aria-disabled'].includes(name)) item.setAttribute(name, value);
    }
    for (const child of template.childNodes) item.append(child.cloneNode(true));
    item.setAttribute('data-aop-nav', id);
    if (href) item.setAttribute('href', href);
    else {
      item.setAttribute('type', 'button');
      Object.assign(item.style, { border: '0', width: '100%', background: 'transparent', color: 'inherit', textAlign: 'inherit' });
    }
    // 原站的焦点辅助节点依赖 Vue 监听，克隆后不能再独立获得焦点。
    for (const child of item.querySelectorAll('[tabindex]')) child.removeAttribute('tabindex');
    item.style.cursor = 'pointer';
    for (const node of [item, ...item.querySelectorAll('*')]) {
      for (const cls of [...node.classList]) if (/active/.test(cls)) node.classList.remove(cls);
    }
    for (const cls of activeClasses) item.classList.remove(cls);
    const icon = item.querySelector('.q-icon');
    if (icon) {
      icon.removeAttribute('data-aop-native-icon');
      icon.innerHTML = iconSvg;
    }
    setLabel(item);
    item.addEventListener('click', (event) => {
      if (href && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }, true);
    item.addEventListener('keydown', (event) => {
      // 不 preventDefault，也不手动模拟点击；保留链接/按钮的原生键盘行为，避免触发播放器全局快捷键。
      if (['Enter', ' '].includes(event.key)) event.stopPropagation();
    }, true);
    return item;
  };

  const setLabel = (item) => {
    const icon = item.querySelector('.q-icon');
    const name = label();
    if (item.title !== name) item.title = name;
    if (item.getAttribute('aria-label') !== name) item.setAttribute('aria-label', name);
    const walker = doc.createTreeWalker(item, 4  );
    let replaced = false;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.nodeValue.trim() || (icon && icon.contains(text))) continue;
      const value = replaced ? '' : name;
      if (text.nodeValue !== value) text.nodeValue = value;
      replaced = true;
    }
  };

  const FALLBACK_ACTIVE = ['q-router-link--active', 'q-router-link--exact-active', 'text-deep-purple', 'text-weight-medium'];
  const isLinkActive = (a) => [...a.classList].some((cls) => /^q-router-link--(exact-)?active$/.test(cls));
  let activeClasses = new Set(FALLBACK_ACTIVE);
  let learned = false;
  const learnActiveClasses = () => {
    if (learned) return;
    const links = [...doc.querySelectorAll('a.q-item')].filter((a) => !a.hasAttribute('data-aop-nav'));
    const active = links.find(isLinkActive);
    const inactive = links.find((a) => !isLinkActive(a));
    if (!active || !inactive) return;
    activeClasses = new Set([...active.classList].filter((cls) => !inactive.classList.contains(cls)));
    learned = true;
  };
  const syncActive = (item) => {
    learnActiveClasses();
    const active = isActive();
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
    for (const cls of FALLBACK_ACTIVE) if (!activeClasses.has(cls)) item.classList.remove(cls);
    for (const cls of activeClasses) item.classList.toggle(cls, active);
  };

  // 侧栏会随网站组件重建；按稳定 data-aop-nav 标识恢复入口，已有节点只更新标签和激活态。
  const ensure = () => {
    const existing = doc.querySelector(`[data-aop-nav="${id}"]`);
    if (existing) {
      syncActive(existing);
      setLabel(existing);
      return true;
    }
    const anchor = selectors.map((sel) => doc.querySelector(sel)).find(Boolean);
    if (!anchor) return false;
    const template = anchor.closest('.q-item') || anchor;
    const item = build(template);
    syncActive(item);
    template.after(item);
    onInsert(item);
    return true;
  };

  const found = ensure();
  onLocaleChange(ensure);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    pageWindow.requestAnimationFrame(() => {
      scheduled = false;
      ensure();
    });
  }).observe(doc.body, { childList: true, subtree: true });
  return found;
}

const ICONS = {
  data: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 10v4c0 2.21 3.58 4 8 4s8-1.79 8-4v-4c-1.72 1.4-4.65 2-8 2s-6.28-.6-8-2zm0 7v2c0 2.21 3.58 4 8 4s8-1.79 8-4v-2c-1.72 1.4-4.65 2-8 2s-6.28-.6-8-2z"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  history: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
};

function addPage(vm, { path, title, renderInto }) {
  const router = vm.$router;
  if (!router || typeof router.addRoute !== 'function' || typeof router.getRoutes !== 'function') return false;
  const sibling = router.getRoutes().find((record) => record.path === '/works');
  const layout = sibling && sibling.parent;
  if (!layout || !layout.components || !layout.components.default) return false;

  const page = {
    name: `Aop${path.replace(/\W/g, '')}Page`,
    render(h) {
      return h('div', { class: 'aop-page' });
    },
    mounted() {
      this.previousTitle = pageWindow.document.title;
      pageWindow.document.title = title();
      this.stopLocale = onLocaleChange(() => { pageWindow.document.title = title(); });
      this.cleanup = renderInto(this.$el);
    },
    beforeDestroy() {
      this.stopLocale();
      pageWindow.document.title = this.previousTitle;
      if (typeof this.cleanup === 'function') this.cleanup();
    },
  };
  router.addRoute({
    path: layout.path || '/',
    component: layout.components.default,
    meta: layout.meta,
    children: [{ path: path.replace(/^\//, ''), component: page, meta: layout.meta }],
  });
  // 直接刷新脚本页面时，原路由可能先匹配到通配页；注册后保留 query/hash 再匹配一次。
  const rematch = () => {
    const loc = pageWindow.location;
    const current = router.currentRoute;
    if (loc.pathname !== path || !current.matched.some((record) => record.path === '*')) return;
    router.replace({ path, query: current.query, hash: current.hash }).catch(() => {});
  };
  if (typeof router.onReady === 'function') router.onReady(rematch);
  else rematch();
  return true;
}

export { ICONS, addNavItem, addPage };
