/*! 声优/标签/社团目录缓存：按 API 地址和类型隔离，合并并发请求，供数量显示和实体识别共用。 */
import { apiGet, getApiBase } from "../core/api.js";
import { favoriteNames } from "./store.js";

function entityNames(item) {
  return [...new Set([item.name, ...Object.values(item.i18n || {}).map((translation) => translation && translation.name)].filter(Boolean))];
}

function workCount(item) {
  const value = item && item.count;
  if (value == null || (typeof value === 'string' && !value.trim()) || (typeof value !== 'number' && typeof value !== 'string')) return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

function sortByWorkCount(items, countOf = workCount) {
  // 未知数量排在有效数量之后；同数量保留原顺序，避免刷新时条目来回跳动。
  return items.map((item, index) => ({ item, index, count: countOf(item) }))
    .sort((a, b) => (b.count == null ? -1 : b.count) - (a.count == null ? -1 : a.count) || a.index - b.index)
    .map(({ item }) => item);
}

const COUNT_REFRESH_MS = 5 * 60 * 1000;

const entityCatalog = {
  entries: new Map(), pending: new Map(), listeners: new Set(),
  key(vm, type) { return `${getApiBase(vm)}:${type}`; },
  get(vm, type) { return this.entries.get(this.key(vm, type)); },
  ingest(vm, type, rows) {
    if (!Array.isArray(rows)) throw new Error('目录数据格式不正确');
    const key = this.key(vm, type);
    if (this.entries.get(key)?.source === rows) return;
    const items = rows.map((row) => ({ id: `site:${row.id}`, siteId: row.id, name: row.name, i18n: row.i18n, aliases: entityNames(row), count: workCount(row) }));
    const byId = new Map(items.map((item) => [String(item.siteId), item]));
    const byName = new Map();
    for (const item of items) for (const name of item.aliases) {
      if (!byName.has(name)) byName.set(name, item);
      // 同名但不同网站 ID 的条目不可按名称自动匹配，避免把关注合并到错误实体。
      else if (byName.get(name)?.siteId !== item.siteId) byName.set(name, null);
    }
    this.entries.set(key, { source: rows, items, byId, byName, updatedAt: Date.now() });
    for (const fn of this.listeners) fn(type);
  },
  find(vm, type, item) {
    const entry = this.get(vm, type);
    if (!entry) return undefined;
    if (item.siteId != null) return entry.byId.get(String(item.siteId));
    return favoriteNames(item).map((name) => entry.byName.get(name)).find(Boolean);
  },
  count(vm, type, item) { return this.find(vm, type, item)?.count ?? null; },
  async load(vm, type, force = false) {
    const key = this.key(vm, type);
    const cached = this.get(vm, type);
    if (!force && cached && Date.now() - cached.updatedAt < COUNT_REFRESH_MS) return;
    if (this.pending.has(key)) return this.pending.get(key);
    const request = apiGet(vm, `${type === 'va' ? 'vas' : type === 'tag' ? 'tags' : 'circles'}/`, { fresh: true })
      .then((rows) => this.ingest(vm, type, rows)).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

export { COUNT_REFRESH_MS, entityCatalog, entityNames, sortByWorkCount };
