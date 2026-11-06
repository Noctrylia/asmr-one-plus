import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = { location: { hostname: 'asmr.one' } };
const { bindWorks, clearSoloWorksCache, loadSoloWorks, refreshPageState } = await import('../src/ui/solo-works.js');
const { readSoloCache, writeSoloCache } = await import('../src/ui/solo-cache.js');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function cancellation() {
  const token = { reason: null, throwIfRequested() { if (this.reason) throw this.reason; } };
  return { token, cancel(message) { token.reason ||= new Error(message); } };
}
function fixture({ enabled = true, total = 950, cap = 999, privateMarks = false, actor = 'actor', nativeLoaded = false, allSolo = false, nativeResponse = false, maxAccepted = Infinity } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1, vas: i % 2 && !allSolo ? [{ name: actor }, { name: 'other' }] : [{ name: actor }],
    ...(privateMarks ? { playlistStatus: { list: i === 0 }, userRating: 4, progress: 'listened', review_text: 'private' } : {}) }));
  const calls = [];
  const watchers = [];
  const events = new Map();
  const pending = [];
  const nativePromises = [];
  let active = 0;
  let peak = 0;
  const owner = {
    keyword: `$va:${actor}$`, globalFilter: '', loggedIn: false, userName: '', works: [], loading: true,
    $route: { path: '/works', query: enabled ? { aopSolo: '1' } : {}, hash: '' },
    parsedKeyword: { specialTerms: [{ namespace: 'va', value: actor, isExclude: false }] },
    requestParams: { page: 1, pageSize: 20, keyword: `$va:${actor}$`, order: 'release', sort: 'desc', withPlaylistStatus: privateMarks ? ['list'] : [] },
    $axios: { CancelToken: { source: cancellation }, defaults: { baseURL: 'https://api.asmr.one' } },
    $options: { methods: { makeMainRequest(token) {
      const { page, pageSize } = this.requestParams;
      const size = Math.min(pageSize, cap);
      const status = Boolean(this.requestParams.withPlaylistStatus?.length);
      const request = { page, size, requested: pageSize, token, keyword: this.keyword, status };
      calls.push(request);
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) => {
        if (pageSize > maxAccepted) return reject(Object.assign(new Error('Invalid pageSize'), { response: { status: 400, data: { errors: [{ param: 'pageSize' }] } } }));
        pending.push({
        ...request, reject,
        resolve() { resolve({ data: { works: rows.slice((page - 1) * size, page * size).map((work) =>
          privateMarks && !status ? { ...work, playlistStatus: null } : work), pagination: { currentPage: page, pageSize: size, totalCount: total } } }); },
        });
      }).finally(() => { active--; });
    } } },
    makeMainRequest() {
      const { page, pageSize } = this.requestParams;
      const response = Promise.resolve(nativeResponse ? { data: { works: rows.slice((page - 1) * pageSize, page * pageSize), pagination: { currentPage: page, pageSize, totalCount: total } } } : { native: true });
      nativePromises.push(response);
      return response;
    },
    requestWorksQueue() {},
    $watch(get, fn) { watchers.push({ get, fn, value: get() }); },
    $once(name, fn) { events.set(name, fn); },
    $router: { replace(route) { owner.$route = route; return Promise.resolve(); } },
  };
  if (nativeLoaded) {
    owner.loading = false;
    owner.works = rows.slice(0, 20);
    owner.pagination = { currentPage: 1, pageSize: 20, totalCount: total };
  }
  const state = bindWorks(owner, () => {});
  const update = () => {
    for (const watcher of watchers) {
      const value = watcher.get();
      if (JSON.stringify(value) === JSON.stringify(watcher.value)) continue;
      const old = watcher.value;
      watcher.value = value;
      watcher.fn(value, old);
    }
  };
  const flush = async () => {
    for (let i = 0; i < 100; i++) {
      await tick();
      const batch = pending.splice(0);
      if (!batch.length) return;
      // 故意反序完成，验证异步返回不会打乱作品排序。
      batch.reverse().forEach((request) => request.resolve());
    }
    throw new Error('Request queue did not finish');
  };
  return { owner, state, calls, pending, flush, update, nativePromises, get peak() { return peak; },
    finishInitialNative() {
      owner.works = rows.slice(0, 20);
      owner.pagination = { currentPage: 1, pageSize: 20, totalCount: total };
      owner.loading = false;
      update();
    },
    destroy() { owner._isDestroyed = true; events.get('hook:beforeDestroy')(); } };
}

test('ordinary browsing makes no solo requests; enabling fills pages and preserves order', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false });
  await delay(180);
  assert.equal(f.calls.length, 0, 'ordinary voice actor browsing must not prefetch');
  assert.equal(f.state.index, null);
  f.owner.loading = false;
  f.update();
  f.owner.requestParams.page = 2;
  assert.deepEqual(await f.owner.makeMainRequest(cancellation().token), { native: true });
  await delay(180);
  assert.equal(f.calls.length, 0, 'native completion and normal pagination must not start solo loading');
  f.owner.requestParams.page = 1;
  f.owner.$route.query.aopSolo = '1';
  f.update();
  const response = f.owner.makeMainRequest(cancellation().token);
  await tick();
  assert.equal(f.calls.length, 1, 'without a native total, the first small request provides it');
  f.pending.shift().resolve();
  await tick();
  assert.equal(f.owner.works.length, 20);
  assert.equal(f.owner.loading, false, 'the usable first page stops the main loading spinner');
  assert.deepEqual(f.owner.works.map((work) => work.id), Array.from({ length: 20 }, (_, i) => i * 2 + 1));
  await f.flush();
  const result = await response;
  assert.ok(f.peak <= 4, 'the preview shares the same request limit');
  assert.equal(result.data.pagination.totalCount, 475);
  assert.equal(new Set(f.calls.map(({ page, size }) => `${page}/${size}`)).size, f.calls.length);
  f.owner.requestParams.page = 24;
  assert.equal((await f.owner.makeMainRequest(cancellation().token)).data.works.length, 15);
  f.owner.requestParams.page = 99;
  assert.equal((await f.owner.makeMainRequest(cancellation().token)).data.pagination.currentPage, 24);
  f.destroy();
});

test('already loaded solo rows appear before any response, without ordinary-page prefetch', async () => {
  for (const nativeLoaded of [true, false]) {
    await clearSoloWorksCache();
    const f = fixture({ enabled: false, allSolo: true, nativeLoaded, nativeResponse: true });
    if (!nativeLoaded) {
      await f.owner.makeMainRequest(cancellation().token);
      f.finishInitialNative();
    }
    assert.equal(f.calls.length, 0);
    f.owner.$route.query.aopSolo = '1';
    f.update();
    f.owner.works = [];
    f.owner.loading = true;
    const response = f.owner.makeMainRequest(cancellation().token);
    await tick();
    assert.equal(f.owner.works.length, 20, 'reuse the native first page immediately');
    assert.ok(f.calls.every((request) => request.size !== 100), 'no duplicate small preview is needed');
    await f.flush();
    assert.equal((await response).data.pagination.totalCount, 950);
    assert.ok(f.peak <= 4);
    f.destroy();
  }
});

test('ordinary requests return the exact native Promise without an async response bridge', async () => {
  const f = fixture({ enabled: false, nativeResponse: true });
  const promise = f.owner.makeMainRequest(cancellation().token);
  assert.equal(promise, f.nativePromises.at(-1));
  const response = await promise;
  assert.equal(response.data.works.length, 20);
  assert.equal(f.calls.length, 0);
  f.destroy();
});

test('the small preview and speculative second page tolerate a mirror page cap', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false, nativeLoaded: true, cap: 400, total: 1758 });
  f.owner.$route.query.aopSolo = '1';
  f.update();
  const response = f.owner.makeMainRequest(cancellation().token);
  await tick();
  const preview = f.pending.findIndex((request) => request.size === 100);
  f.pending.splice(preview, 1)[0].resolve();
  await tick();
  assert.ok(f.calls.some((request) => request.page === 2), 'known native total lets the second page start early');
  await f.flush();
  const data = (await response).data;
  assert.equal(data.pagination.totalCount, 879);
  assert.deepEqual(data.works.map((work) => work.id), Array.from({ length: 20 }, (_, i) => i * 2 + 1));
  assert.ok(f.peak <= 4);
  f.destroy();
});

test('a native request already in flight at binding is captured without extra requests', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false, allSolo: true });
  f.finishInitialNative();
  assert.equal(f.calls.length, 0);
  f.owner.$route.query.aopSolo = '1';
  f.update();
  f.owner.works = [];
  f.owner.loading = true;
  const response = f.owner.makeMainRequest(cancellation().token);
  await tick();
  assert.equal(f.owner.works.length, 20);
  assert.ok(f.calls.every((request) => request.size !== 100));
  await f.flush();
  assert.equal((await response).data.pagination.totalCount, 950);
  f.destroy();
});

test('a mirror rejecting pageSize 999 falls back to 500 without dropping results', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false, nativeLoaded: true, total: 3758, maxAccepted: 500 });
  f.owner.$route.query.aopSolo = '1';
  f.update();
  const response = f.owner.makeMainRequest(cancellation().token);
  await tick();
  await f.flush();
  assert.equal((await response).data.pagination.totalCount, 1879);
  assert.ok(f.calls.some((request) => request.requested === 500));
  assert.ok(f.peak <= 4);
  f.destroy();
});

test('large searches share four slots and a late small preview cannot shrink the full buffer', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false, nativeLoaded: true, total: 3758 });
  f.owner.$route.query.aopSolo = '1';
  f.update();
  f.owner.works = [];
  const response = f.owner.makeMainRequest(cancellation().token);
  await tick();
  assert.equal(f.peak, 4);
  const first = f.pending.findIndex((request) => request.page === 1 && request.size === 999);
  f.pending.splice(first, 1)[0].resolve();
  await tick();
  assert.equal(f.state.index.works.length, 500);
  const preview = f.pending.findIndex((request) => request.page === 1 && request.size === 100);
  f.pending.splice(preview, 1)[0].resolve();
  await tick();
  assert.equal(f.state.index.works.length, 500);
  await f.flush();
  assert.equal((await response).data.pagination.totalCount, 1879);
  assert.equal(f.peak, 4);
  f.destroy();
});

test('a native empty result requires no solo request', async () => {
  await clearSoloWorksCache();
  const f = fixture({ enabled: false, nativeLoaded: true, total: 0 });
  f.owner.$route.query.aopSolo = '1';
  f.update();
  const result = await f.owner.makeMainRequest(cancellation().token);
  assert.equal(result.data.pagination.totalCount, 0);
  assert.equal(f.calls.length, 0);
  f.destroy();
});

test('complete cache is reused across owners and page sizes, but not accounts', async () => {
  await clearSoloWorksCache();
  const original = fixture();
  const originalResponse = original.owner.makeMainRequest(cancellation().token);
  await original.flush();
  await originalResponse;
  original.destroy();
  const cached = fixture();
  cached.owner.requestParams.pageSize = 40;
  const result = await cached.owner.makeMainRequest(cancellation().token);
  assert.equal(result.data.works.length, 40);
  assert.equal(cached.calls.length, 0);
  cached.destroy();
  for (const privateMarks of [false, true]) {
    const other = fixture({ privateMarks });
    other.owner.userName = 'another-account';
    const response = other.owner.makeMainRequest(cancellation().token);
    await other.flush();
    await response;
    assert.ok(other.calls.length > 0);
    other.destroy();
  }
});

test('collection marks no longer disable caching; only current source pages refresh', async () => {
  await clearSoloWorksCache();
  const first = fixture({ privateMarks: true });
  const response = first.owner.makeMainRequest(cancellation().token);
  await first.flush();
  const result = await response;
  assert.equal(result.data.works[0].playlistStatus.list, true);
  assert.ok(first.calls.filter((request) => !request.status).length >= 2, 'bulk reads exclude collection status');
  assert.equal(first.calls.filter((request) => request.status).length, 1, 'only the current source page fetches personal status');
  assert.ok(first.calls.filter((request) => request.status).every((request) => request.size <= 100));
  first.destroy();
  const second = fixture({ privateMarks: true });
  const cached = await second.owner.makeMainRequest(cancellation().token);
  assert.equal(cached.data.pagination.totalCount, 475);
  assert.equal(cached.data.works.length, 20);
  assert.equal(cached.data.works[0].playlistStatus, null, 'stale marks must not appear');
  assert.equal(cached.data.works[0].review_text, undefined);
  assert.equal(second.calls.length, 1, 'one current-page status request, no full scan');
  await second.flush();
  assert.equal(cached.data.works[0].playlistStatus.list, true);
  assert.equal(second.calls.length, 1);
  second.destroy();
  const third = fixture({ privateMarks: true });
  const again = await third.owner.makeMainRequest(cancellation().token);
  assert.equal(again.data.works[0].playlistStatus, null, 'refreshing one owner must not mutate the cached public snapshot');
  third.destroy();
  await third.flush();
});

test('a late status response cannot update another page', async () => {
  const f = fixture({ privateMarks: true });
  const rows = [{ id: 1, vas: [{ name: 'actor' }], playlistStatus: null, userRating: null }];
  const result = { works: rows, sourcePositions: [0], pagination: { pageSize: 100, totalCount: 950 } };
  const refresh = refreshPageState(f.owner, result, 0, rows, cancellation().token, () => false);
  await f.flush();
  await refresh;
  assert.equal(rows[0].playlistStatus, null);
  f.destroy();
});

test('leaving the list cancels unfinished loading and returning starts a fresh job', async () => {
  await clearSoloWorksCache();
  const first = fixture();
  const firstResponse = first.owner.makeMainRequest(cancellation().token);
  const canceled = assert.rejects(firstResponse, /Solo search changed/);
  await tick();
  first.pending.shift().resolve();
  await tick();
  const index = first.state.index;
  first.destroy();
  assert.ok(index.source.token.reason);
  const count = first.calls.length;
  await first.flush();
  await canceled;
  assert.equal(first.calls.length, count, 'no later batches after leaving');
  const second = fixture();
  const response = second.owner.makeMainRequest(cancellation().token);
  assert.notEqual(second.state.index, index);
  await second.flush();
  assert.equal((await response).data.pagination.totalCount, 475);
  second.destroy();
});

test('request failures are retryable; partial failures clear the preview', async () => {
  await clearSoloWorksCache();
  const f = fixture();
  const initial = f.owner.makeMainRequest(cancellation().token);
  const initialRejected = assert.rejects(initial, /Network failed/);
  await tick();
  f.pending.shift().reject(new Error('Network failed'));
  await initialRejected;
  await f.flush();
  const response = f.owner.makeMainRequest(cancellation().token);
  const rejected = assert.rejects(response, /Network failed/);
  await tick();
  f.pending.shift().resolve();
  await tick();
  assert.equal(f.owner.works.length, 20);
  const failedIndex = f.state.index;
  const failedPage = f.pending.findIndex((request) => request.page > 1);
  assert.ok(failedPage >= 0);
  f.pending.splice(failedPage, 1)[0].reject(new Error('Network failed'));
  await rejected;
  assert.equal(f.owner.works.length, 0);
  assert.ok(failedIndex.source.token.reason);
  await f.flush();
  f.destroy();
});

test('rapid query changes cancel preparation and do not mix keywords', async () => {
  await clearSoloWorksCache();
  const f = fixture();
  const oldResponse = f.owner.makeMainRequest(cancellation().token);
  const canceled = assert.rejects(oldResponse, /Solo search changed/);
  await tick();
  const old = f.state.index;
  const oldCalls = f.calls.length;
  f.owner.keyword = '$va:new$';
  f.owner.requestParams.keyword = f.owner.keyword;
  f.update();
  assert.ok(old.source.token.reason);
  f.owner.$route.query.aopSolo = '1';
  f.update();
  const response = f.owner.makeMainRequest(cancellation().token);
  await f.flush();
  await canceled;
  await response;
  assert.ok(f.calls.slice(oldCalls).every((call) => call.keyword === '$va:new$'));
  f.destroy();
});

test('turning solo off cancels in-flight batches and does not restart them', async () => {
  await clearSoloWorksCache();
  const f = fixture();
  const response = f.owner.makeMainRequest(cancellation().token);
  const canceled = assert.rejects(response, /Solo search changed/);
  await tick();
  f.pending.shift().resolve();
  await tick();
  const index = f.state.index;
  delete f.owner.$route.query.aopSolo;
  f.update();
  assert.ok(index.source.token.reason);
  const count = f.calls.length;
  await f.flush();
  await canceled;
  f.owner.loading = false;
  f.update();
  await delay(180);
  assert.equal(f.calls.length, count);
  assert.equal(f.state.index, null);
  assert.deepEqual(await f.owner.makeMainRequest(cancellation().token), { native: true });
  f.destroy();
});

test('source page caps and empty results preserve exact totals', async () => {
  for (const cap of [20, 100, 200, 400]) {
    const f = fixture({ cap });
    const result = loadSoloWorks(f.owner, f.owner.requestParams, cancellation().token, () => {}, 100);
    await f.flush();
    assert.deepEqual((await result).works.map((work) => work.id), Array.from({ length: 475 }, (_, i) => i * 2 + 1));
    f.destroy();
  }
  await clearSoloWorksCache();
  const empty = fixture({ total: 0 });
  const response = empty.owner.makeMainRequest(cancellation().token);
  await empty.flush();
  assert.equal((await response).data.pagination.totalCount, 0);
  empty.destroy();
});

test('cache expires from creation, stays bounded and tolerates disabled IndexedDB', async () => {
  await clearSoloWorksCache();
  const data = { works: [], sourcePositions: [], pagination: { totalCount: 0 } };
  for (const key of ['a', 'b', 'c', 'd']) await writeSoloCache(key, data);
  assert.equal(await readSoloCache('a'), null);
  assert.deepEqual(await readSoloCache('d'), data);
  const now = Date.now;
  try {
    Date.now = () => now() + 5 * 60 * 1000 + 1;
    assert.equal(await readSoloCache('d'), null);
  } finally { Date.now = now; }
  await clearSoloWorksCache();
  assert.equal(await readSoloCache('c'), null);
});
