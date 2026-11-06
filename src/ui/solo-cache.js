/*! 完整搜索快照：异步保存在当前站点的 IndexedDB，不写入个人数据备份。 */
import { pageWindow } from "../core/runtime.js";

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_LIMIT = 3;
const memory = new Map();
let database;
let generation = 0;

function openCache() {
  if (!database) database = new Promise((resolve) => {
    try {
      const request = pageWindow.indexedDB.open('asmr-one-plus-solo', 1);
      // 禁用存储、配额不足或旧标签阻塞升级时，不能阻塞作品加载。
      let expired = false;
      const timeout = setTimeout(() => { expired = true; resolve(null); }, 200);
      request.onupgradeneeded = () => request.result.createObjectStore('searches', { keyPath: 'key' });
      request.onerror = request.onblocked = () => { clearTimeout(timeout); resolve(null); };
      request.onsuccess = () => {
        clearTimeout(timeout);
        const db = request.result;
        if (expired) { db.close(); return; }
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
    } catch { resolve(null); }
  });
  return database;
}

function valid(entry) {
  return entry && Number.isFinite(entry.createdAt) && Date.now() >= entry.createdAt &&
    Date.now() - entry.createdAt < CACHE_TTL && Array.isArray(entry.result?.works) &&
    Number.isSafeInteger(entry.result.pagination?.totalCount) &&
    Array.isArray(entry.result.sourcePositions) && entry.result.sourcePositions.length === entry.result.works.length &&
    entry.result.sourcePositions.every((position, i, positions) => Number.isSafeInteger(position) && position >= 0 &&
      position < entry.result.pagination.totalCount && (i === 0 || position > positions[i - 1]));
}

function remember(entry) {
  memory.delete(entry.key);
  memory.set(entry.key, entry);
  while (memory.size > CACHE_LIMIT) memory.delete(memory.keys().next().value);
}

function publicResult(result) {
  const works = result.works.map(({ playlistStatus, userRating, progress, review_text, ...work }) =>
    ({ ...work, playlistStatus: null, userRating: null }));
  return { ...result, works };
}

async function readSoloCache(key) {
  const local = memory.get(key);
  if (valid(local)) { remember(local); return publicResult(local.result); }
  memory.delete(key);
  const epoch = generation;
  const db = await openCache();
  if (!db || epoch !== generation) return null;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 200);
    const done = (result) => { clearTimeout(timeout); resolve(result); };
    try {
      const request = db.transaction('searches').objectStore('searches').get(key);
      request.onerror = () => done(null);
      request.onsuccess = () => {
        const entry = request.result;
        if (epoch !== generation || !valid(entry)) return done(null);
        remember(entry);
        done(publicResult(entry.result));
      };
    } catch { done(null); }
  });
}

async function writeSoloCache(key, result) {
  // 收藏夹、个人评分等随时可能改变，只缓存公开作品信息；显示时单独补当前页状态。
  const entry = { key, result: publicResult(result), createdAt: Date.now() };
  remember(entry);
  const epoch = generation;
  const db = await openCache();
  if (!db || epoch !== generation) return;
  await new Promise((resolve) => {
    try {
      const transaction = db.transaction('searches', 'readwrite');
      transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
      const store = transaction.objectStore('searches');
      store.put(entry);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result.sort((a, b) => b.createdAt - a.createdAt);
        entries.forEach((item, i) => { if (i >= CACHE_LIMIT || !valid(item)) store.delete(item.key); });
      };
    } catch { resolve(); }
  });
}

async function clearSoloCache() {
  generation++;
  memory.clear();
  const db = await openCache();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const transaction = db.transaction('searches', 'readwrite');
      transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
      transaction.objectStore('searches').clear();
    } catch { resolve(); }
  });
}

async function removeSoloCache(key) {
  memory.delete(key);
  const db = await openCache();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const transaction = db.transaction('searches', 'readwrite');
      transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
      transaction.objectStore('searches').delete(key);
    } catch { resolve(); }
  });
}

export { clearSoloCache, readSoloCache, removeSoloCache, writeSoloCache };
