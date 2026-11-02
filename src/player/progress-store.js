/*! 播放进度仓库：按音轨 hash 保存 {t: 秒, d: 总时长秒, title, updatedAt: 毫秒}，不负责删除历史。 */
import { storage } from "../core/storage.js";

const PROGRESS_KEY = 'progress';

// 这里只限制持续播放时的写入频率；暂停、切歌、离开页面不受这个间隔限制。
const SAVE_INTERVAL_MS = 5000;

const END_MARGIN_SECONDS = 10;

const titleKey = (title) => String(title || '').replace(/\.[^./\\]+$/, '').normalize('NFKC').trim().toLowerCase();

const closeDuration = (a, b) => !a || !b || Math.abs(a - b) <= Math.max(1, Math.min(a, b) * 0.01);

/*! 不同音频格式可能有不同 hash。同一作品内用去扩展名的标题和接近的时长识别同一音轨。
 * 旧记录没有标题时，仅接受唯一的时长匹配，避免把其他音轨的进度接过来。
 */
function progressSiblings(all, track) {
  const workId = String(track.hash).split('/')[0];
  const base = titleKey(track.title);
  const candidates = Object.entries(all).filter(([hash]) => hash !== track.hash && hash.split('/')[0] === workId);
  const byRecent = (entries) => entries.sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(([hash]) => hash);
  const named = candidates.filter(([, entry]) => entry.title && base && titleKey(entry.title) === base && closeDuration(entry.d, track.duration));
  if (named.length) return byRecent(named);
  const legacy = candidates.filter(([, entry]) => !entry.title && track.duration > 0 && entry.d > 0 && Math.abs(entry.d - track.duration) <= 1);
  return legacy.length === 1 ? byRecent(legacy) : [];
}

const progressStore = {
  listeners: new Set(),
  clearListeners: new Set(),
  all() {
    return storage.get(PROGRESS_KEY, {});
  },
  get(hash) {
    return this.all()[hash];
  },
  find(track) {
    const all = this.all();
    if (all[track.hash]) return all[track.hash];
    const [sibling] = progressSiblings(all, track);
    return sibling ? all[sibling] : undefined;
  },
  save(hash, t, d, title) {
    const all = this.all();
    for (const sibling of progressSiblings(all, { hash, title, duration: d })) delete all[sibling];
    all[hash] = { t, d, ...(title ? { title } : {}), updatedAt: Date.now() };
    storage.set(PROGRESS_KEY, all);
    this.changed();
  },
  clear(hash, title, d) {
    const all = this.all();
    const keys = [hash, ...progressSiblings(all, { hash, title, duration: d })].filter((key) => key in all);
    if (!keys.length) return false;
    for (const key of keys) delete all[key];
    storage.set(PROGRESS_KEY, all);
    this.changed();
    return true;
  },
  clearAll() {
    storage.remove(PROGRESS_KEY);
    for (const fn of this.clearListeners) fn();
    this.changed();
  },
  onClear(fn) {
    this.clearListeners.add(fn);
    return () => this.clearListeners.delete(fn);
  },
  version: 0,
  changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  },
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

// 末尾余量取 10 秒与总长 5% 中较小者，防止短音频过早被认作听完。
function isFinished(t, d) {
  return d > 0 && t >= d - Math.min(END_MARGIN_SECONDS, d * 0.05);
}

export { SAVE_INTERVAL_MS, isFinished, progressSiblings, progressStore };
