/*! 备份边界：仅处理脚本本地数据，不导出网站登录令牌；导入采用校验、合并、写入和失败回滚。 */
import { SCRIPT_VERSION } from "../core/config.js";
import { tr } from "../core/i18n.js";
import { el, notify, pageWindow } from "../core/runtime.js";
import { storage } from "../core/storage.js";
import { FAVORITE_TYPES, favoriteNames, favoritesStore, sameFavorite } from "../follows/store.js";
import { HISTORY_LIMIT, historyStore } from "../history/store.js";
import { historyView } from "../history/view.js";
import { isFinished, progressStore } from "../player/progress-store.js";
import { progressFeature } from "../player/progress.js";

const backupFeature = {
  name: 'backup',
  read() {
    return this.clean({ history: historyStore.all(), progress: progressStore.all(), favorites: favoritesStore.all(), favoritesTab: storage.get('favorites-tab', 'va') }, { lenient: true });
  },
  skipped: 0,
  /*! 读取本地数据时允许跳过坏记录，导入文件则严格校验；返回字段白名单，避免直接保存任意输入对象。 */
  clean(data, { lenient = false } = {}) {
    let skipped = 0;
    const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const list = (value, max) => {
      if (lenient && value == null) return [];
      if (!Array.isArray(value) || (!lenient && value.length > max)) throw new Error(tr('backupBadList'));
      return lenient ? value.slice(0, max) : value;
    };
    const each = (values, fn) => values.flatMap((value) => {
      if (!lenient) return [fn(value)];
      try { return [fn(value)]; } catch { skipped++; return []; }
    });
    const text = (value, max = 2048, empty = false) => { if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) throw new Error(tr('backupBadText')); return value; };
    const number = (value = 0) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
        if (lenient) return 0;
        throw new Error(tr('backupBadNumber'));
      }
      return value;
    };
    const hash = (value) => { if (!/^\d+\/[^\s]{1,512}$/.test(text(value, 530))) throw new Error(tr('backupBadTrack')); return value; };
    if (lenient && object(data)) {
      data = { ...data, favorites: object(data.favorites) ? data.favorites : {}, progress: object(data.progress) ? data.progress : {} };
    }
    if (!object(data) || !object(data.favorites) || !object(data.progress)) throw new Error(tr('backupBadStructure'));
    const history = each(list(data.history, 5000), (item) => {
      if (!object(item) || !Number.isSafeInteger(item.workId) || item.workId <= 0) throw new Error(tr('backupBadWork'));
      const sourceId = text(item.sourceId, 80);
      if (!/^[a-zA-Z0-9_-]+$/.test(sourceId)) throw new Error(tr('backupBadSource'));
      const trackHash = hash(item.trackHash);
      if (Number(trackHash.split('/')[0]) !== item.workId) throw new Error(tr('backupTrackMismatch'));
      return { workId: item.workId, sourceId, workTitle: text(item.workTitle), trackHash, trackTitle: text(item.trackTitle, 2048, true), t: number(item.t), d: number(item.d), updatedAt: number(item.updatedAt) };
    });
    let positions = Object.entries(data.progress);
    if (positions.length > 50000) {
      if (!lenient) throw new Error(tr('backupTooManyProgress'));
      positions = positions.sort(([, a], [, b]) => (b?.updatedAt || 0) - (a?.updatedAt || 0)).slice(0, 50000);
    }
    const progress = Object.fromEntries(each(positions, ([key, item]) => {
      if (!object(item)) throw new Error(tr('backupBadProgress'));
      const title = typeof item.title === 'string' && item.title.trim() && item.title.length <= 2048 ? { title: item.title } : {};
      return [hash(key), { t: number(item.t), d: number(item.d), ...title, updatedAt: number(item.updatedAt) }];
    }));
    const favorites = { groups: {} };
    for (const [type, { inbox }] of Object.entries(FAVORITE_TYPES)) {
      const names = each(list(data.favorites.groups?.[type], 1000), value => text(value, 256));
      favorites.groups[type] = [...new Set([...names.map(name => name === '未分组' ? inbox : name), inbox])];
      favorites[type] = each(list(data.favorites[type], 20000), (item) => {
        if (!object(item)) throw new Error(tr('backupBadFollow'));
        const id = typeof item.id === 'number' ? String(number(item.id)) : text(item.id, 512);
        const group = item.group === '未分组' ? inbox : item.group;
        const result = { id, name: text(item.name, 512), group: favorites.groups[type].includes(group) ? group : inbox, addedAt: number(item.addedAt) };
        if (item.siteId != null) result.siteId = typeof item.siteId === 'number' ? number(item.siteId) : text(item.siteId, 512);
        if (item.aliases != null) result.aliases = [...new Set(each(list(item.aliases, 1000), value => text(value, 512)))];
        return result;
      });
    }
    this.skipped = skipped;
    return { history, progress, favorites, favoritesTab: Object.hasOwn(FAVORITE_TYPES, data.favoritesTab) ? data.favoritesTab : 'va' };
  },
  // version 是备份格式版本，scriptVersion 才是脚本版本；两者不要一起随发布递增。
  make() { return { format: 'asmr-one-plus-backup', version: 1, scriptVersion: SCRIPT_VERSION, exportedAt: new Date().toISOString(), data: this.read() }; },
  parse(text) {
    if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) throw new Error(tr('backupInvalidFile'));
    let file;
    try { file = JSON.parse(text); } catch { throw new Error(tr('backupNotJson')); }
    if (file?.format !== 'asmr-one-plus-backup' || file.version !== 1) throw new Error(tr('backupUnsupported'));
    return this.clean(file.data);
  },
  /*! 合并不覆盖已有关注的分组；历史按作品、进度按 hash 取较新记录，已有数据时保留本地选中的标签页。 */
  merge(incoming, current = this.read()) {
    const hadLocal = current.history.length || Object.keys(current.progress).length || Object.keys(FAVORITE_TYPES).some(type => current.favorites[type].length || current.favorites.groups[type].length > 1);
    const favorites = current.favorites;
    for (const type of Object.keys(FAVORITE_TYPES)) {
      favorites.groups[type] = [...new Set([...favorites.groups[type], ...incoming.favorites.groups[type]])];
      for (const item of incoming.favorites[type]) {
        const existing = favorites[type].find(entry => sameFavorite(entry, item));
        if (!existing) favorites[type].push(item);
        else {
          if (existing.siteId == null && item.siteId != null) existing.siteId = item.siteId;
          existing.aliases = [...new Set([...favoriteNames(existing), ...favoriteNames(item)])];
        }
      }
    }
    // 同时间戳时保留本地历史；进度也只接受时间戳更新的导入记录。
    const byWork = new Map();
    for (const item of [...incoming.history, ...current.history]) if (!byWork.has(item.workId) || item.updatedAt >= byWork.get(item.workId).updatedAt) byWork.set(item.workId, item);
    const history = [...byWork.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, HISTORY_LIMIT);
    const progress = current.progress;
    for (const [key, value] of Object.entries(incoming.progress)) if (!progress[key] || value.updatedAt > progress[key].updatedAt) progress[key] = value;
    for (const entry of history) if (isFinished(entry.t, entry.d) && progress[entry.trackHash] && entry.updatedAt >= progress[entry.trackHash].updatedAt) delete progress[entry.trackHash];
    return { favorites, history, progress, favoritesTab: hadLocal ? current.favoritesTab : incoming.favoritesTab };
  },
  apply(incoming) {
    const keys = ['history', 'progress', 'favorites', 'favorites-tab'];
    // GM 存储没有跨键事务，写入前保留原值，任一写入失败时尝试逐键恢复。
    const before = Object.fromEntries(keys.map(key => [key, storage.get(key, undefined)]));
    const next = this.merge(this.clean(incoming), this.read());
    try {
      storage.set('history', next.history); storage.set('progress', next.progress);
      storage.set('favorites', { ...before.favorites, ...next.favorites, groups: { ...before.favorites?.groups, ...next.favorites.groups } });
      storage.set('favorites-tab', next.favoritesTab);
    } catch {
      try { for (const key of keys) { if (before[key] === undefined) storage.remove(key); else storage.set(key, before[key]); } }
      catch { throw new Error(tr('storageFailed')); }
      throw new Error(tr('importRolledBack'));
    }
    // 防止播放器退出页面时，用导入前的内存快照覆盖刚合并的记录。
    progressFeature.invalidate?.();
    progressStore.changed();
    for (const fn of favoritesStore.listeners) fn();
    if (historyView.container?.isConnected) historyView.renderInto(historyView.container);
  },
  download(vm) {
    try {
      const json = JSON.stringify(this.make(), null, 2);
      if (this.skipped) notify(vm, tr('exportSkipped', this.skipped));
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = el('a', { href: url, download: `asmr-one-plus-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json` });
      pageWindow.document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { notify(vm, tr('exportFailed')); }
  },
  choose(vm) {
    const input = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', 'data-aop-backup-file': '' });
    input.addEventListener('cancel', () => input.remove());
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) throw new Error(tr('backupTooLarge'));
        const data = this.parse(await file.text());
        const count = Object.keys(FAVORITE_TYPES).reduce((sum, type) => sum + data.favorites[type].length, 0);
        this.read();
        if (!pageWindow.confirm(tr('importConfirm', count, data.history.length, Object.keys(data.progress).length, this.skipped))) return;
        this.apply(data);
        notify(vm, tr('importDone'));
      } catch (err) { notify(vm, err.message || tr('importFailed')); }
      finally { input.remove(); }
    });
    pageWindow.document.body.append(input); input.click();
  },
  buttons(vm) {
    const menu = el('details', { class: 'aop-backup' });
    if (!this.outsideCloser) {
      this.outsideCloser = (event) => {
        for (const open of pageWindow.document.querySelectorAll('details.aop-backup[open]')) if (!open.contains(event.target)) open.open = false;
      };
      pageWindow.document.addEventListener('click', this.outsideCloser, true);
    }
    const pick = (action) => () => { menu.open = false; action(); };
    menu.append(
      el('summary', { class: 'aop-btn aop-data-button' }, tr('backup')),
      el('div', { class: 'aop-backup-menu' }, [
        el('button', { class: 'aop-btn aop-flat', 'data-aop-backup': 'export', onclick: pick(() => this.download(vm)) }, tr('exportBackup')),
        el('button', { class: 'aop-btn aop-flat', 'data-aop-backup': 'import', onclick: pick(() => this.choose(vm)) }, tr('importBackup')),
      ]),
    );
    return [menu];
  },
};

export { backupFeature };
