/*! 我的关注页面：负责分组操作和按作品数量展示；页面级刷新定时器、订阅在退出时释放。 */
import { LOCALE_INFO, currentLocale, localizedEntityName, onLocaleChange, tr, typeLabel, typeNoun } from "../core/i18n.js";
import { el, notify, pageWindow } from "../core/runtime.js";
import { storage } from "../core/storage.js";
import { COUNT_REFRESH_MS, entityCatalog, sortByWorkCount } from "./catalog.js";
import { FAVORITE_TYPES, favoritesStore, groupName, keywordRoute } from "./store.js";
import { ICONS, addNavItem, addPage } from "../ui/navigation.js";

const FAVORITES_PATH = '/favorites';

const favoritesView = {
  tab: 'va',
  countErrors: {},

  watchCounts(container) {
    const refresh = (force = false) => {
      if (container.isConnected && pageWindow.document.visibilityState !== 'hidden') return this.loadCounts(this.tab, force);
    };
    const timer = setInterval(() => refresh(true), COUNT_REFRESH_MS);
    const onReturn = () => refresh();
    pageWindow.addEventListener('focus', onReturn);
    pageWindow.document.addEventListener('visibilitychange', onReturn);
    return () => {
      clearInterval(timer);
      pageWindow.removeEventListener('focus', onReturn);
      pageWindow.document.removeEventListener('visibilitychange', onReturn);
    };
  },

  loadCounts(type, force = false) {
    delete this.countErrors[type];
    const request = entityCatalog.load(this.vm, type, force);
    this.renderInto(this.container);
    return request.catch(() => { this.countErrors[type] = true; }).finally(() => {
      if (this.container && this.container.isConnected) this.renderInto(this.container);
    });
  },

  mount(vm) {
    GM_addStyle(`
      .aop-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid rgba(128,128,128,.25); }
      .aop-tab { border: none; background: none; padding: 10px 16px; font-size: 14px; cursor: pointer; color: #888;
        border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .aop-tab.aop-on { color: #673ab7; border-bottom-color: #673ab7; font-weight: 500; }
      .aop-chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .aop-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px 6px 14px; border-radius: 16px;
        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); font-size: 14px; }
      .body--dark .aop-chip { background: #1d1d1d; }
      .aop-chip-name { cursor: pointer; }
      .aop-chip-name:hover { color: #673ab7; }
      .aop-chip-x { border: none; background: none; color: #aaa; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
      .aop-chip-x:hover { color: #c10015; }
      .aop-work-count { color: #00897b; font-size: 12px; white-space: nowrap; }
      .body--dark .aop-work-count { color: #80cbc4; }
      .aop-refresh { margin-left: auto; align-self: center; border: none; background: none; color: #aaa; cursor: pointer;
        font-size: 16px; line-height: 1; padding: 6px 8px; border-radius: 50%; }
      .aop-refresh:hover { color: #673ab7; background: rgba(128,128,128,.1); }
      .aop-refresh.aop-loading { cursor: default; animation: aop-spin 1s linear infinite; }
      @keyframes aop-spin { to { transform: rotate(360deg); } }
      .aop-count-error { color: #c10015; font-size: 13px; margin: -8px 0 12px; }
      .aop-group { margin-bottom: 18px; padding: 12px 14px 14px; border-radius: 6px; border: 1px dashed transparent;
        background: rgba(128,128,128,.06); }
      .aop-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .aop-group-name { font-size: 16px; font-weight: 500; }
      .aop-group-count { color: #888; font-size: 13px; }
      .aop-group-tools { margin-left: auto; display: flex; gap: 4px; }
      .aop-group-tools button, .aop-add-group { border: none; background: none; color: #888; cursor: pointer; font-size: 13px; padding: 2px 6px; }
      .aop-group-tools button:hover, .aop-add-group:hover { color: #673ab7; }
      .aop-group-empty { color: #999; font-size: 13px; padding: 4px 0; }
      .aop-chip-move { appearance: none; -webkit-appearance: none; border: none; box-shadow: none; color: transparent; text-shadow: none;
        background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23999' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat center / 12px 12px;
        font-size: 12px; cursor: pointer; width: 22px; min-width: 22px; max-width: 22px; flex: 0 0 22px; padding: 0;
        opacity: 0; transition: opacity .15s; }
      .aop-chip:hover .aop-chip-move, .aop-chip:focus-within .aop-chip-move { opacity: 1; }
      @media (hover: none), (pointer: coarse) { .aop-chip-move { opacity: 1; } }
      .aop-chip-move option { background: #fff; color: #222; }
      .body--dark .aop-chip-move { color-scheme: dark; }
      .body--dark .aop-chip-move option { background: #1d1d1d; color: #eee; }
    `);

    this.vm = vm;
    try {
      this.tab = storage.get('favorites-tab', 'va');
    } catch (err) {
      this.tab = 'va';
    }
    const hasPage = addPage(vm, { path: FAVORITES_PATH, title: () => `${tr('following')} - ASMR Online`, renderInto: (container) => this.mountLive(container) });
    if (!hasPage) return;
    const open = () => vm.$router.push(FAVORITES_PATH).catch(() => {});
    addNavItem({
      id: 'favorites',
      label: () => tr('following'),
      iconSvg: ICONS.star,
      href: FAVORITES_PATH,
      onClick: open,
      isActive: () => vm.$route && vm.$route.path === FAVORITES_PATH,
      after: '/playlists',
    });
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(tr('following'), open);
  },

  mountLive(container) {
    this.renderInto(container);
    const stopFavorites = favoritesStore.onChange(() => this.renderInto(container));
    const stopCounts = entityCatalog.onChange(() => this.renderInto(container));
    const stopLocale = onLocaleChange(() => this.renderInto(container));
    const stopRefresh = this.watchCounts(container);
    this.loadCounts(this.tab);
    return () => { stopFavorites(); stopCounts(); stopLocale(); stopRefresh(); if (this.container === container) this.container = null; };
  },

  renderInto(container) {
    const vm = this.vm;
    this.container = container;
    const data = favoritesStore.all();
    if (!Object.hasOwn(FAVORITE_TYPES, this.tab)) this.tab = 'va';

    const tabs = el('div', { class: 'aop-tabs' }, Object.keys(FAVORITE_TYPES).map((type) =>
      el('button', {
        class: `aop-tab${type === this.tab ? ' aop-on' : ''}`,
        'data-tab': type,
        onclick: () => {
          this.tab = type;
          storage.set('favorites-tab', type);
          this.renderInto(container);
          this.loadCounts(type);
        },
      }, tr('tab', typeLabel(type), data[type].length))));

    const type = this.tab;
    const items = sortByWorkCount(data[type], (item) => entityCatalog.count(vm, type, item));
    const groups = data.groups[type];
    const loading = entityCatalog.pending.has(entityCatalog.key(vm, type));
    const updatedAt = entityCatalog.get(vm, type)?.updatedAt;
    const refreshTitle = loading ? tr('loadingCounts') : tr('refreshCounts', updatedAt ? new Date(updatedAt).toLocaleTimeString(LOCALE_INFO[currentLocale()].tag, { hour: '2-digit', minute: '2-digit' }) : null);
    tabs.append(el('button', {
      class: `aop-refresh${loading ? ' aop-loading' : ''}`,
      'data-aop-refresh': '',
      title: refreshTitle,
      'aria-label': refreshTitle,
      ...(loading ? { disabled: '' } : {}),
      onclick: () => this.loadCounts(type, true),
    }, '↻'));
    const countError = this.countErrors[type] ? el('div', { class: 'aop-count-error', role: 'status' }, tr('countError')) : null;
    const emptyHint = items.length ? null : tr('followHint', typeNoun(type));
    const body = el('div', {}, groups.map((group) => this.renderGroup(type, group, items.filter((item) => item.group === group), emptyHint)));
    const addGroup = el('button', {
      class: 'aop-add-group',
      onclick: () => {
        const name = pageWindow.prompt(tr('newGroupPrompt'));
        if (name && !favoritesStore.addGroup(type, name)) notify(vm, tr('groupNameInvalid'));
      },
    }, tr('newGroup'));

    container.replaceChildren(
      el('div', { class: 'aop-head' }, [el('h1', {}, tr('following'))]),
      tabs,
      ...(countError ? [countError] : []),
      body,
      addGroup,
    );
  },

  renderGroup(type, group, items, emptyHint = null) {
    const vm = this.vm;
    const isInbox = group === FAVORITE_TYPES[type].inbox;
    const tools = [
      el('button', {
        title: tr('addTitle'),
        onclick: () => {
          const text = pageWindow.prompt(tr('addPrompt', groupName(type, group), typeNoun(type)));
          if (!text) return;
          // 名字本身可能含逗号；批量输入仅接受中英文分号，不再按逗号拆分。
          for (const name of text.split(/[;；]+/).map((x) => x.trim()).filter(Boolean)) {
            if (favoritesStore.has(type, name)) favoritesStore.move(type, name, group);
            else favoritesStore.add(type, { id: name, name, group }, { append: true });
          }
        },
      }, tr('add')),
    ];
    if (items.length) {
      tools.push(el('button', {
        'data-aop-clear-group': '',
        onclick: () => {
          if (pageWindow.confirm(tr('confirmClearGroup', groupName(type, group), items.length, typeNoun(type)))) favoritesStore.clearGroup(type, group);
        },
      }, tr('clearGroup')));
    }
    if (!isInbox) {
      tools.push(
        el('button', {
          onclick: () => {
            const name = pageWindow.prompt(tr('renamePrompt'), group);
            if (name && name !== group && !favoritesStore.renameGroup(type, group, name)) notify(vm, tr('groupNameInvalid'));
          },
        }, tr('rename')),
        el('button', {
          onclick: () => {
            if (pageWindow.confirm(tr('confirmDeleteGroup', group, items.length, tr('inbox')))) {
              favoritesStore.removeGroup(type, group);
            }
          },
        }, tr('deleteGroup')),
      );
    }

    const allGroups = favoritesStore.groups(type);
    const chips = items.map((item) => {
      const move = el('select', {
        class: 'aop-chip-move',
        title: tr('moveToGroup'),
        onchange: (event) => favoritesStore.move(type, item.id, event.target.value),
      }, allGroups.map((g) => {
        const option = el('option', { value: g }, groupName(type, g));
        if (g === group) option.selected = true;
        return option;
      }));
      const entry = entityCatalog.find(vm, type, item);
      const count = entry ? entry.count : null;
      return el('span', {
        class: 'aop-chip',
        'data-id': String(item.id),
      }, [
        el('span', { class: 'aop-chip-name', onclick: () => vm.$router.push(keywordRoute(type, item.name)).catch(() => {}) }, localizedEntityName(entry, item.name)),
        el('span', { class: 'aop-work-count' }, count == null ? tr('unknown') : tr('works', count)),
        move,
        el('button', { class: 'aop-chip-x', title: tr('unfollow'), onclick: () => favoritesStore.remove(type, item.id) }, '×'),
      ]);
    });

    return el('div', {
      class: 'aop-group',
      'data-group': group,
    }, [
      el('div', { class: 'aop-group-head' }, [
        el('span', { class: 'aop-group-name' }, groupName(type, group)),
        el('span', { class: 'aop-group-count' }, String(items.length)),
        el('div', { class: 'aop-group-tools' }, tools),
      ]),
      items.length ? el('div', { class: 'aop-chips' }, chips) : (isInbox && emptyHint ? el('div', { class: 'aop-group-empty' }, emptyHint) : null),
    ]);
  },
};

export { favoritesView };
