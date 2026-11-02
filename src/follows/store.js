/*! 本地关注与分组仓库。关注标识优先用网站 ID，别名用于识别手动输入或不同语言下的同一实体。 */
import { MESSAGES, tr } from "../core/i18n.js";
import { storage } from "../core/storage.js";

const FAVORITES_KEY = 'favorites';

// 默认分组名是稳定的存储值；界面翻译通过 groupName 显示，切换语言时不要改写存储名。
const FAVORITE_TYPES = {
  va: { keyword: 'va', groups: ['默认分组'], inbox: '默认分组' },
  tag: { keyword: 'tag', groups: ['默认分组'], inbox: '默认分组' },
  circle: { keyword: 'circle', groups: ['默认分组'], inbox: '默认分组' },
};

const INBOX_NAMES = new Set(Object.values(MESSAGES).map((messages) => messages.inbox));

function groupName(type, group) {
  return group === FAVORITE_TYPES[type].inbox ? tr('inbox') : group;
}

function favoriteNames(item) {
  return [...new Set([item.name, ...(item.aliases || [])].filter(Boolean))];
}

function sameFavorite(item, target) {
  if (typeof target !== 'object' || target == null) return String(item.id) === String(target) || favoriteNames(item).includes(String(target));
  if (item.siteId != null && target.siteId != null) return String(item.siteId) === String(target.siteId);
  return String(item.id) === String(target.id) || favoriteNames(item).some((name) => favoriteNames(target).includes(name));
}

const favoritesStore = {
  listeners: new Set(),
  version: 0,
  all() {
    const data = storage.get(FAVORITES_KEY, {});
    let migrated = false;
    data.groups = data.groups || {};
    for (const [type, { groups, inbox }] of Object.entries(FAVORITE_TYPES)) {
      data[type] = data[type] || [];
      data.groups[type] = data.groups[type] || [...groups];
      if (data.groups[type].includes('未分组')) {
        data.groups[type] = [...new Set(data.groups[type].map((name) => name === '未分组' ? inbox : name))];
        for (const item of data[type]) if (item.group === '未分组') item.group = inbox;
        migrated = true;
      }
      if (!data.groups[type].includes(inbox)) data.groups[type].push(inbox);
      for (const item of data[type]) if (!data.groups[type].includes(item.group)) item.group = inbox;
    }
    if (migrated) storage.set(FAVORITES_KEY, data);
    return data;
  },
  groups(type) {
    return this.all().groups[type];
  },
  list(type) {
    return this.all()[type];
  },
  find(type, target) {
    return this.list(type).find((item) => sameFavorite(item, target));
  },
  has(type, target) {
    return !!this.find(type, target);
  },
  // 将旧的纯名称关注补全为网站实体，同时保留原分组和所有已知别名。
  reconcile(type, item) {
    const data = this.all();
    const matches = data[type].filter((entry) => sameFavorite(entry, item));
    if (!matches.length) return null;
    const first = matches[0];
    const siteId = item.siteId != null ? item.siteId : first.siteId;
    const merged = { ...first, ...(siteId != null ? { siteId } : {}), aliases: [...new Set([...matches, item].flatMap(favoriteNames))].sort() };
    const next = data[type].filter((entry) => !matches.includes(entry) || entry === first).map((entry) => entry === first ? merged : entry);
    if (JSON.stringify(next) !== JSON.stringify(data[type])) {
      data[type] = next;
      this.save(data);
    }
    return merged;
  },
  add(type, item, { append = false } = {}) {
    if (this.has(type, item)) { this.reconcile(type, item); return; }
    const data = this.all();
    const group = data.groups[type].includes(item.group) ? item.group : FAVORITE_TYPES[type].inbox;
    data[type][append ? 'push' : 'unshift']({ ...item, group, addedAt: Date.now() });
    this.save(data);
  },
  move(type, id, group, beforeId) {
    const data = this.all();
    const list = data[type];
    const index = list.findIndex((item) => sameFavorite(item, id));
    if (index < 0 || !data.groups[type].includes(group)) return;
    const [item] = list.splice(index, 1);
    item.group = group;
    const before = beforeId == null ? -1 : list.findIndex((x) => sameFavorite(x, beforeId));
    if (before >= 0) list.splice(before, 0, item);
    else list.push(item);
    this.save(data);
  },
  addGroup(type, name) {
    const data = this.all();
    name = name.trim();
    if (!name || data.groups[type].includes(name) || INBOX_NAMES.has(name)) return false;
    const groups = data.groups[type];
    const inboxAt = groups.indexOf(FAVORITE_TYPES[type].inbox);
    groups.splice(inboxAt < 0 ? groups.length : inboxAt, 0, name);
    this.save(data);
    return true;
  },
  renameGroup(type, from, to) {
    const data = this.all();
    to = to.trim();
    const groups = data.groups[type];
    if (!to || groups.includes(to) || INBOX_NAMES.has(to) || !groups.includes(from) || from === FAVORITE_TYPES[type].inbox) return false;
    groups[groups.indexOf(from)] = to;
    for (const item of data[type]) if (item.group === from) item.group = to;
    this.save(data);
    return true;
  },
  removeGroup(type, name) {
    const data = this.all();
    if (name === FAVORITE_TYPES[type].inbox) return;
    data.groups[type] = data.groups[type].filter((g) => g !== name);
    for (const item of data[type]) if (item.group === name) item.group = FAVORITE_TYPES[type].inbox;
    this.save(data);
  },
  clearGroup(type, group) {
    const data = this.all();
    data[type] = data[type].filter((item) => item.group !== group);
    this.save(data);
  },
  remove(type, id) {
    const data = this.all();
    data[type] = data[type].filter((item) => !sameFavorite(item, id));
    this.save(data);
  },
  toggle(type, item) {
    const existing = this.find(type, item);
    if (existing) this.remove(type, existing.id);
    else this.add(type, item);
    return this.has(type, item);
  },
  clear() {
    storage.remove(FAVORITES_KEY);
    storage.remove('favorites-tab');
    storage.remove('favorites-sort');
    storage.remove('directory-sort');
    this.version++;
    for (const fn of this.listeners) fn();
  },
  save(data) {
    storage.set(FAVORITES_KEY, data);
    this.version++;
    for (const fn of this.listeners) fn();
  },
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

function keywordRoute(type, name) {
  return { path: '/works', query: { keyword: `$${FAVORITE_TYPES[type].keyword}:${name}$` } };
}

export { FAVORITE_TYPES, favoriteNames, favoritesStore, groupName, keywordRoute, sameFavorite };
