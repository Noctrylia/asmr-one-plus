/*! 网站页面关注入口：向作品元数据、目录和搜索菜单补充星标；实体识别与存储交给 catalog/store。 */
import { currentLocale, onLocaleChange, tr, typeNoun } from "../core/i18n.js";
import { LOG_PREFIX, el, notify, pageWindow } from "../core/runtime.js";
import { storage } from "../core/storage.js";
import { entityCatalog, entityNames, sortByWorkCount } from "./catalog.js";
import { FAVORITE_TYPES, favoritesStore, sameFavorite } from "./store.js";
import { favoritesView } from "./view.js";

const favoriteButtons = {
  mount(vm) {
    GM_addStyle(`
      .aop-star { display: inline-flex; align-items: center; justify-content: center; border: none; background: none;
        cursor: pointer; padding: 0 2px; margin: 0 6px 0 -2px; font-size: 18px; line-height: 1; color: #bbb;
        vertical-align: middle; }
      .aop-star:hover { color: #ffb300; }
      .aop-star.aop-on { color: #ffb300; }
      .aop-star.aop-directory-star { width: 22px; height: 22px; padding: 0; margin: 0 0 0 6px; vertical-align: middle; }
      .aop-directory-star:not(.aop-on) { opacity: 0; }
      .aop-directory-entry:hover .aop-directory-star,
      .aop-directory-entry:focus-within .aop-directory-star { opacity: 1; }
      @media (hover: none), (pointer: coarse) { .aop-star.aop-directory-star { opacity: 1; } }
      .aop-search-star { font-size: 24px; margin-left: 4px; }
      .aop-meta-anchor { position: relative; }
      .aop-star.aop-floating-star { position: absolute; top: -2px; right: -2px; z-index: 1;
        width: 21px; height: 21px; padding: 0; margin: 0; border-radius: 50%;
        background: #fff; color: #b77900; box-shadow: 0 1px 3px rgba(0,0,0,.2);
        font-size: 16px; line-height: 1; opacity: 0; pointer-events: none; transition: opacity .12s; }
      .aop-star.aop-floating-star.aop-on { color: #ffb300; }
      .body--dark .aop-star.aop-floating-star { background: #2d2d2d; color: #ffc44b; }
      .aop-meta-anchor:hover > .aop-floating-star,
      .aop-meta-anchor:focus-within > .aop-floating-star,
      .aop-star.aop-floating-star.aop-on { opacity: 1; pointer-events: auto; }
      @media (hover: none), (pointer: coarse) {
        .aop-star.aop-floating-star { width: 24px; height: 24px; opacity: 1; pointer-events: auto; }
      }
      @media (prefers-reduced-motion: reduce) { .aop-star.aop-floating-star { transition: none; } }
      .aop-follow-menu-item { appearance: none; width: 100%; border: 0; text-align: left;
        font: inherit; color: inherit; background: transparent; }
      .aop-follow-menu-item .q-item__section--avatar { min-width: 36px; }
    `);
    this.vm = vm;
    // DOM 改动与脚本自己的插入都可能触发观察器；同一帧只协调一次，ensure 中也要避免重复改写。
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      pageWindow.requestAnimationFrame(() => {
        scheduled = false;
        try {
          this.ensure();
        } catch (err) {
          console.error(LOG_PREFIX, '关注按钮', err);
        }
      });
    };
    new MutationObserver(run).observe(pageWindow.document.body, { childList: true, subtree: true, characterData: true });
    favoritesStore.onChange(run);
    onLocaleChange(run);
    run();
  },

  ensure() {
    const route = this.vm.$route || {};
    const page = pageWindow.document.querySelector('.q-page-container');
    if (page) {
      if (/^\/work\//.test(route.path || '')) this.ensureFloatingStars(page);
      directoryView.ensure(this.vm, page, route);
      this.ensureSearchStar(page, route);
    }
    this.ensureMenus();
    this.syncStars();
  },

  star(type, item, extraClass = '') {
    const button = el('button', {
      type: 'button',
      class: `aop-star ${extraClass}`.trim(),
      'data-aop-star': type,
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        let current = button.aopItem;
        let currentType = button.dataset.aopStar;
        // 网站可能复用原 DOM，点击时重新读取其 Vue props，不能一直信任创建星标时的实体。
        if (button.aopAnchor) {
          const anchor = button.aopAnchor;
          const props = componentProps(anchor, (p) => FAVORITE_TYPES[p.searchType]);
          if (!anchor.isConnected || !props || !props.searchContent) return;
          currentType = props.searchType;
          current = this.item(currentType, props.searchContent, anchor);
          favoritesStore.reconcile(currentType, current);
          button.aopItem = current;
          button.dataset.aopStar = currentType;
        }
        const on = favoritesStore.toggle(currentType, current);
        this.syncStars();
        notify(this.vm, tr('followed', on, current.name));
      },
    });
    button.aopItem = item;
    return button;
  },

  syncStars() {
    const lists = {};
    for (const button of pageWindow.document.querySelectorAll('[data-aop-star]')) {
      const type = button.dataset.aopStar;
      lists[type] = lists[type] || favoritesStore.list(type) || [];
      const on = lists[type].some((item) => sameFavorite(item, button.aopItem));
      const label = tr('starLabel', on, button.aopItem.name);
      if (button.classList.contains('aop-on') === on && button.dataset.aopSynced && button.getAttribute('aria-label') === label) continue;
      button.dataset.aopSynced = '1';
      button.classList.toggle('aop-on', on);
      button.title = on ? tr('unfollow') : tr('follow');
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? '★' : '☆';
    }
  },

  reconcile(type, item) {
    if (this.reconciledVersion !== favoritesStore.version) {
      this.reconciled = new Set();
      this.reconciledVersion = favoritesStore.version;
    }
    const key = JSON.stringify([type, item.name, item.siteId ?? null, item.aliases || []]);
    if (this.reconciled.has(key)) return;
    this.reconciled.add(key);
    favoritesStore.reconcile(type, item);
  },

  item(type, name, anchor) {
    const item = favoriteItem(findMetadata(anchor), type, name);
    if (item.siteId != null) return item;
    let entry;
    if (DIRECTORY_TYPES[this.vm.$route?.path] === type) {
      for (let comp = anchor.__vue__; comp && comp.$el === anchor; comp = comp.$parent) {
        if (comp.$vnode?.key != null) entry = entityCatalog.get(this.vm, type)?.byId.get(String(comp.$vnode.key));
        if (entry) break;
      }
    }
    entry = entry || entityCatalog.find(this.vm, type, item);
    return entry ? { ...item, id: entry.id, siteId: entry.siteId, aliases: entry.aliases } : item;
  },

  ensureFloatingStars(page) {
    for (const button of page.querySelectorAll('.aop-floating-star')) {
      const anchor = button.aopAnchor;
      const props = anchor && componentProps(anchor, (p) => FAVORITE_TYPES[p.searchType]);
      if (!props || !props.searchContent || button.parentElement !== anchor) {
        button.remove();
        if (anchor && anchor.classList.contains('aop-meta-anchor')) anchor.classList.toggle('aop-meta-anchor', false);
      }
    }
    for (const node of page.querySelectorAll('*')) {
      const props = componentProps(node, (p) => FAVORITE_TYPES[p.searchType]);
      if (!props || !props.searchContent) continue;
      const type = props.searchType;
      const item = this.item(type, props.searchContent, node);
      this.reconcile(type, item);
      if (!node.classList.contains('aop-meta-anchor')) node.classList.toggle('aop-meta-anchor', true);
      let button = [...node.querySelectorAll('.aop-floating-star')].find((child) => child.parentElement === node);
      if (!button) {
        button = this.star(type, item, 'aop-floating-star');
        node.append(button);
      }
      button.aopAnchor = node;
      button.aopItem = item;
      button.dataset.aopStar = type;
    }
  },

  ensureMenus() {
    for (const menu of pageWindow.document.querySelectorAll('.q-menu')) {
      const context = searchMenuContext(menu);
      const list = menu.querySelector('.q-list');
      if (!context || !list) {
        for (const old of menu.querySelectorAll('[data-aop-follow-menu]')) old.remove();
        continue;
      }
      const { searchType: type, searchContent: name } = context.owner.$props;
      const item = this.item(type, name, context.owner.$el);
      this.reconcile(type, item);
      let action = list.querySelector('[data-aop-follow-menu]');
      if (!action) {
        action = el('button', {
          type: 'button', role: 'menuitem', 'data-aop-follow-menu': type,
          class: 'q-item q-item-type row no-wrap q-item--clickable q-link cursor-pointer q-focusable q-hoverable aop-follow-menu-item',
          onclick: (event) => {
            event.preventDefault();
            const current = searchMenuContext(menu);
            if (!current) return;
            const props = current.owner.$props;
            const target = this.item(props.searchType, props.searchContent, current.owner.$el);
            favoritesStore.reconcile(props.searchType, target);
            const on = favoritesStore.toggle(props.searchType, target);
            notify(this.vm, tr('followed', on, target.name));
            if (typeof current.controller.hide === 'function') {
              event.stopPropagation();
              current.controller.hide(event);
            }
          },
        }, [
          el('span', { class: 'q-item__section column q-item__section--avatar q-item__section--side justify-center' }, el('i', { class: 'q-icon material-icons aop-follow-menu-icon', 'aria-hidden': 'true' })),
          el('span', { class: 'q-item__section column q-item__section--main justify-center aop-follow-menu-label' }),
        ]);
        list.append(action);
      }
      action.aopItem = item;
      action.dataset.aopFollowMenu = type;
      const on = favoritesStore.has(type, item);
      const label = tr('followMenu', on, typeNoun(type));
      const icon = action.querySelector('.aop-follow-menu-icon');
      const text = action.querySelector('.aop-follow-menu-label');
      if (icon.textContent !== (on ? 'star' : 'star_border')) icon.textContent = on ? 'star' : 'star_border';
      if (text.textContent !== label) text.textContent = label;
      action.setAttribute('aria-label', `${label}${currentLocale() === 'en' ? ': ' : '：'}${name}`);
    }
  },

  ensureSearchStar(page, route) {
    const keyword = route.path === '/works' && route.query && route.query.keyword;
    const match = typeof keyword === 'string' && keyword.trim().match(/^\$(va|tag|circle):([^$]+)\$$/);
    const existing = page.querySelector('.aop-search-star');
    const key = match ? `${match[1]}:${match[2]}` : null;
    if (existing && existing.dataset.key === key) return;
    if (existing) existing.remove();
    if (!match) return;
    const chip = page.querySelector('h1.text-h5 > span.inline-block');
    if (!chip) return;
    const [, type, name] = match;
    const star = this.star(type, { id: name, name }, 'aop-search-star');
    star.dataset.key = key;
    chip.after(star);
  },
};

const DIRECTORY_TYPES = { '/vas': 'va', '/tags': 'tag', '/circles': 'circle' };

const directoryView = {
  bindings: new WeakMap(),
  owner(page, type) {
    const seen = new Set();
    for (const node of [page, ...page.querySelectorAll('*')]) {
      for (let comp = node.__vue__; comp && !seen.has(comp); comp = comp.$parent) {
        seen.add(comp);
        const restrict = comp.$props && comp.$props.restrict;
        if (DIRECTORY_TYPES[`/${restrict}`] === type && Array.isArray(comp.items)) return comp;
      }
    }
    return null;
  },
  ensure(vm, page, route) {
    const type = DIRECTORY_TYPES[route.path];
    if (!type) return;
    const owner = this.owner(page, type);
    const viewport = page.querySelector('.q-virtual-scroll');
    if (!owner || !viewport) return;
    let state = this.bindings.get(owner);
    if (!state) { state = { type, source: null }; this.bindings.set(owner, state); }
    if (state.type !== type) {
      state.waiting = owner.items === state.source;
      state.oldSource = owner.items;
      state.type = type;
      state.sortedSource = null;
    }
    if (state.waiting && owner.items === state.oldSource) {
      for (const star of page.querySelectorAll('.aop-directory-star')) star.remove();
      return;
    }
    state.waiting = false;
    if (state.sortedSource !== owner.items) {
      const ordered = sortByWorkCount(owner.items);
      if (ordered.some((item, index) => item !== owner.items[index])) { owner.items = ordered; viewport.scrollTop = 0; }
      state.sortedSource = owner.items;
    }
    state.source = owner.items;
    if (owner.items.length) entityCatalog.ingest(vm, type, owner.items);
    for (const node of page.querySelectorAll('*')) {
      const props = componentProps(node, (p) => p.searchType === type && p.searchContent);
      if (!props) continue;
      const label = node.querySelector('.q-item__label');
      if (!label) continue;
      const item = favoriteButtons.item(type, props.searchContent, node);
      favoriteButtons.reconcile(type, item);
      let star = label.querySelector('.aop-directory-star');
      if (!star) { star = favoriteButtons.star(type, item, 'aop-directory-star'); label.append(star); }
      star.aopAnchor = node; star.aopItem = item; star.dataset.aopStar = type;
      if (!node.classList.contains('aop-directory-entry')) node.classList.toggle('aop-directory-entry', true);
    }
  },
};

function searchMenuContext(menu) {
  for (const node of [menu, ...menu.querySelectorAll('*')]) {
    let controller = null;
    for (let comp = node.__vue__; comp; comp = comp.$parent) {
      if (comp.$options && comp.$options.name === 'QMenu') controller = comp;
      const props = comp.$props;
      if (controller && props && FAVORITE_TYPES[props.searchType] && typeof props.searchContent === 'string' && props.searchContent) {
        if (comp._isDestroyed || !comp.$el || !comp.$el.isConnected) return null;
        return { owner: comp, controller };
      }
    }
  }
  return null;
}

function componentProps(node, test) {
  for (let comp = node.__vue__; comp && comp.$el === node; comp = comp.$parent) {
    if (comp.$props && test(comp.$props)) return comp.$props;
  }
  return null;
}

function findMetadata(node) {
  for (let n = node; n; n = n.parentElement) {
    const props = componentProps(n, (p) => p.metadata);
    if (props) return props.metadata;
  }
  return null;
}

function favoriteItem(metadata, type, name) {
  const list = !metadata ? [] : type === 'circle' ? [metadata.circle].filter(Boolean) : metadata[type === 'va' ? 'vas' : 'tags'] || [];
  const found = list.find((entry) => entityNames(entry).includes(name));
  return { id: found && found.id != null ? `site:${found.id}` : name, name, ...(found ? { siteId: found.id, aliases: entityNames(found) } : {}) };
}

const favoritesFeature = {
  name: 'favorites',
  init(vm) {
    storage.remove('favorites-sort');
    storage.remove('directory-sort');
    favoritesView.mount(vm);
    favoriteButtons.mount(vm);
  },
};

export { favoritesFeature };
