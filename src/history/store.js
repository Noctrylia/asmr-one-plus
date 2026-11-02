/*! 历史按作品 workId 去重，保存该作品最后播放音轨的快照，最多保留 200 部作品；清除历史不删除进度。 */
import { storage } from "../core/storage.js";

const HISTORY_KEY = 'history';

const HISTORY_LIMIT = 200;

const historyStore = {
  deleteListeners: new Set(),
  all() {
    return storage.get(HISTORY_KEY, []);
  },
  touch(entry) {
    const list = this.all().filter((item) => item.workId !== entry.workId);
    list.unshift({ ...entry, updatedAt: Date.now() });
    storage.set(HISTORY_KEY, list.slice(0, HISTORY_LIMIT));
  },
  remove(workId) {
    storage.set(HISTORY_KEY, this.all().filter((item) => item.workId !== workId));
    for (const fn of this.deleteListeners) fn(workId);
  },
  clear() {
    storage.remove(HISTORY_KEY);
    for (const fn of this.deleteListeners) fn(null);
  },
  onDelete(fn) {
    this.deleteListeners.add(fn);
    return () => this.deleteListeners.delete(fn);
  },
};

export { HISTORY_LIMIT, historyStore };
