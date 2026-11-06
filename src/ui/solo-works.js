/*! 单人出演：按原站顺序收集单人作品，再把真实总数和当前页交给原站分页器。 */
import { getApiBase } from "../core/api.js";
import { onLocaleChange, tr } from "../core/i18n.js";
import { LOG_PREFIX, el, pageWindow } from "../core/runtime.js";
import { clearSoloCache, readSoloCache, removeSoloCache, writeSoloCache } from "./solo-cache.js";

const SOLO_QUERY = 'aopSolo';
const SOURCE_PAGE_SIZE = 999;
const SOURCE_CONCURRENCY = 4;
let sharedIndex = null;

function hasSingleActor(owner) {
  if (owner.$route?.path !== '/works') return false;
  const terms = owner.parsedKeyword?.specialTerms || [];
  const actors = new Set(terms.filter(({ namespace, isExclude, value }) =>
    (namespace === 'va' || namespace === 'v') && !isExclude && value).map(({ value }) => value));
  return actors.size === 1;
}

function soloEnabled(owner) {
  return owner.$route?.query?.[SOLO_QUERY] === '1' && hasSingleActor(owner);
}

function isSoloWork(work) {
  return Array.isArray(work?.vas) && work.vas.length === 1 && Boolean(work.vas[0]?.name);
}

function searchQuery(owner) {
  const { page, pageSize, ...params } = owner.requestParams;
  return { page, pageSize: Number(pageSize), params, key: JSON.stringify([getApiBase(owner), owner.loggedIn, owner.userName, params]) };
}

async function loadSoloWorks(owner, params, token, onProgress, previewSize, seed = null) {
  token.throwIfRequested();
  const request = owner.$options.methods.makeMainRequest;
  const { keyword, globalFilter } = owner;
  const fetchPage = async (page, size) => {
    token.throwIfRequested();
    const context = Object.create(owner, {
      keyword: { value: keyword }, globalFilter: { value: globalFilter },
      requestParams: { value: { ...params, withPlaylistStatus: [], page, pageSize: size } },
    });
    try { return await request.call(context, token); }
    catch (error) {
      // 较旧镜像若限制页大小，逐级退回已支持的大小；不更换用户的接口。
      if (size <= 400 || error.response?.status !== 400 ||
          !error.response.data?.errors?.some((item) => item.param === 'pageSize')) throw error;
      return fetchPage(page, size > 500 ? 500 : 400);
    }
  };
  const validPagination = (data) => Number.isSafeInteger(data?.pagination?.totalCount) && data.pagination.totalCount >= 0 &&
    Number.isInteger(data.pagination.pageSize) && data.pagination.pageSize >= 1;
  const validRows = (data, page, size, total) => {
    token.throwIfRequested();
    if (data.pagination?.currentPage !== page || data.pagination.pageSize !== size || data.pagination.totalCount !== total ||
        !Array.isArray(data.works) || data.works.length !== Math.max(0, Math.min(size, total - (page - 1) * size))) {
      throw new Error('读取单人作品时搜索结果发生变化');
    }
    return data.works;
  };
  if (seed && (!validPagination(seed) || !Array.isArray(seed.works))) seed = null;
  let initialFetched = false;
  if (!seed) {
    const { data } = await fetchPage(1, previewSize || 400);
    if (!validPagination(data)) throw new Error('单人作品搜索返回了无效的分页数据');
    seed = data;
    initialFetched = true;
  }
  let prefix = [];
  if (seed?.pagination.currentPage === 1) {
    prefix = validRows(seed, 1, seed.pagination.pageSize, seed.pagination.totalCount).filter(isSoloWork);
    onProgress(prefix);
    if (seed.works.length === seed.pagination.totalCount) {
      if (new Set(seed.works.map((work) => work?.id)).size !== seed.works.length || seed.works.some((work) => work?.id == null)) {
        throw new Error('搜索结果出现重复或无效的作品编号');
      }
      return { works: prefix, sourcePositions: seed.works.flatMap((work, i) => isSoloWork(work) ? [i] : []), pagination: seed.pagination };
    }
  }

  // 原站已经给出的总数只用于提前安排请求，最终总数仍逐页校验、完整计算。
  const needPreview = !initialFetched && previewSize && prefix.length < 20 && seed.pagination.totalCount > previewSize;
  // 在并发预算内均分剩余工作，避免把请求集中成一个慢的大响应。
  let pageSize = Math.min(SOURCE_PAGE_SIZE, Math.max(100, Math.ceil(seed.pagination.totalCount / (SOURCE_CONCURRENCY - (needPreview ? 1 : 0)))));
  let pageCount = Math.ceil(seed.pagination.totalCount / pageSize);
  let totalCount;
  let firstPagination;
  let firstError;
  let established = false;
  let signalFirst;
  const firstDone = new Promise((resolve) => { signalFirst = resolve; });
  const works = [];
  const sourcePositions = [];
  const seen = new Set();
  const pending = new Map();
  let committed = 1;
  let next = 2;
  const commit = (page, rows) => {
    pending.set(page, rows);
    while (pending.has(committed)) {
      for (const work of pending.get(committed)) {
        if (work?.id == null || seen.has(work.id)) throw new Error('搜索结果出现重复或无效的作品编号');
        seen.add(work.id);
        if (isSoloWork(work)) { works.push(work); sourcePositions.push(seen.size - 1); }
      }
      pending.delete(committed++);
      onProgress(works);
    }
  };
  const rest = async () => {
    while (true) {
      token.throwIfRequested();
      if (next > pageCount) {
        if (established) return;
        await firstDone;
        if (firstError) throw firstError;
        continue;
      }
      const page = next++;
      const response = await fetchPage(page, pageSize);
      await firstDone;
      if (firstError) throw firstError;
      commit(page, validRows(response.data, page, pageSize, totalCount));
    }
  };
  const main = async () => {
    try {
      const size = pageSize;
      const { data } = await fetchPage(1, size);
      if (!validPagination(data) || data.pagination.pageSize > size) throw new Error('单人作品搜索返回了无效的分页数据');
      totalCount = data.pagination.totalCount;
      pageSize = data.pagination.pageSize;
      firstPagination = data.pagination;
      pageCount = Math.ceil(totalCount / pageSize);
      commit(1, validRows(data, 1, pageSize, totalCount));
      established = true;
    } catch (error) { firstError = error; throw error; }
    finally { signalFirst(); }
    await rest();
  };
  const foreground = async () => {
    // 小请求只在开启筛选后执行，与整组整理共享同一个并发上限。
    if (needPreview) {
      try {
        const { data } = await fetchPage(1, previewSize);
        if (!established && validPagination(data) && data.pagination.pageSize <= previewSize &&
            (!seed || data.pagination.totalCount === seed.pagination.totalCount)) {
          onProgress(validRows(data, 1, data.pagination.pageSize, data.pagination.totalCount).filter(isSoloWork));
        }
      } catch { token.throwIfRequested(); }
    }
    await rest();
  };
  await Promise.all([main(), foreground(), ...Array.from({ length: SOURCE_CONCURRENCY - 2 }, () => rest())]);
  token.throwIfRequested();
  return { works, sourcePositions, pagination: firstPagination };
}

async function refreshPageState(owner, result, start, rows, token, isCurrent) {
  const { params } = searchQuery(owner);
  const { keyword, globalFilter } = owner;
  const size = Math.min(100, result.pagination.pageSize);
  const pages = [...new Set(result.sourcePositions.slice(start, start + rows.length).map((position) => Math.floor(position / size) + 1))];
  const fresh = new Map();
  let next = 0;
  const worker = async () => {
    while (next < pages.length) {
      token.throwIfRequested();
      const page = pages[next++];
      const context = Object.create(owner, {
        keyword: { value: keyword }, globalFilter: { value: globalFilter },
        requestParams: { value: { ...params, page, pageSize: size } },
      });
      const response = await owner.$options.methods.makeMainRequest.call(context, token);
      token.throwIfRequested();
      const { pagination, works } = response.data;
      if (pagination?.currentPage !== page || pagination.pageSize !== size || pagination.totalCount !== result.pagination.totalCount || !Array.isArray(works)) return false;
      for (const work of works) fresh.set(work.id, work);
    }
    return true;
  };
  const valid = (await Promise.all([worker(), worker()])).every(Boolean) && rows.every((work) => isSoloWork(fresh.get(work.id)));
  if (!isCurrent()) return true;
  if (!valid) return false;
  // 保留页面和排序，只更新当前卡片状态；不会重新扫描整位声优。
  for (const work of rows) {
    const update = fresh.get(work.id);
    work.playlistStatus = update.playlistStatus ?? null;
    work.userRating = update.userRating ?? null;
  }
  return true;
}

function bindWorks(owner, schedule) {
  const state = { index: null };
  const nativeRequest = owner.makeMainRequest;
  let stateRefresh;
  let nativeSnapshot;
  const captureNative = (data, key) => {
    const pagination = data?.pagination;
    if (!Array.isArray(data?.works) || !Number.isSafeInteger(pagination?.totalCount) || pagination.totalCount < 0 ||
        !Number.isSafeInteger(pagination.currentPage) || pagination.currentPage < 1 ||
        !Number.isSafeInteger(pagination.pageSize) || pagination.pageSize < 1 ||
        data.works.length !== Math.max(0, Math.min(pagination.pageSize, pagination.totalCount - (pagination.currentPage - 1) * pagination.pageSize))) return;
    nativeSnapshot = { data: { ...data, works: data.works.slice() }, key, createdAt: Date.now() };
  };
  if (!soloEnabled(owner) && !owner.loading) captureNative({ works: owner.works, pagination: owner.pagination }, searchQuery(owner).key);
  const discard = () => {
    const index = state.index;
    if (index?.previewOwner === owner) index.showPage = null;
    if (index && !index.ready) index.source.cancel('Solo search changed');
    state.index = null;
  };

  const prepare = () => {
    const { page, pageSize, params, key } = searchQuery(owner);
    if (state.index?.source.token.reason) discard();
    if (state.index?.key !== key) {
      discard();
      if (sharedIndex?.key === key && !sharedIndex.source.token.reason) {
        state.index = sharedIndex;
      } else {
        if (sharedIndex) sharedIndex.source.cancel('Another solo search started');
        const source = owner.$axios.CancelToken.source();
        const index = { key, source, ready: false, works: [], showPage: null };
        state.index = index;
        sharedIndex = index;
        const firstSize = page === 1 && pageSize <= 20 ? 100 : 0;
        // 先读异步磁盘缓存；命中时不请求接口，刷新网页后也能直接翻页。
        index.result = (async () => {
          const cached = await readSoloCache(key);
          source.token.throwIfRequested();
          // 存储读取期间切换搜索时，不允许使用新声优的 keyword 搭配旧参数。
          if (searchQuery(owner).key !== key) throw new Error('Solo search changed');
          if (cached) { index.fromCache = true; return cached; }
          const seed = nativeSnapshot?.key === key && Date.now() - nativeSnapshot.createdAt < 30000 ? nativeSnapshot.data : null;
          const result = await loadSoloWorks(owner, params, source.token, (works) => {
            index.works = works;
            index.showPage?.();
          }, firstSize, seed);
          void writeSoloCache(key, result);
          return result;
        })().then((result) => {
          index.ready = true;
          index.works = result.works;
          return result;
        }, (err) => {
          source.cancel('Solo search failed');
          throw err;
        }).finally(() => {
          if (sharedIndex === index) sharedIndex = null;
          schedule();
        });
        // 请求取消后可能暂时没有页面等待它，避免留下未处理的 Promise。
        index.result.catch(() => {});
      }
      schedule();
    }
    return state.index;
  };

  const requestSolo = async (token) => {
    const { page, pageSize, key } = searchQuery(owner);
    prepare();
    const index = state.index;
    const offset = (page - 1) * pageSize;
    let shown = false;
    const stillOnPage = () => {
      if (token.reason || owner._isDestroyed || !soloEnabled(owner)) return false;
      const current = searchQuery(owner);
      return current.key === key && current.page === page && current.pageSize === pageSize;
    };
    const showPage = () => {
      if (shown || index.works.length < offset + pageSize || !stillOnPage()) return;
      owner.works = index.works.slice(offset, offset + pageSize);
      // 首屏已可使用，不让原站的大加载动画一直转到总数统计完成。
      owner.loading = false;
      shown = true;
      schedule();
    };
    if (!index.ready) {
      index.previewOwner = owner;
      index.showPage = showPage;
      showPage();
    }
    // 原站切页会取消旧请求，同一组搜索条件继续共用后台正在整理的结果。
    let result;
    try {
      result = await index.result;
    } catch (err) {
      if (shown && index.showPage === showPage && stillOnPage()) owner.works = [];
      if (state.index === index) discard();
      throw err;
    } finally {
      if (index.showPage === showPage) index.showPage = null;
      token.throwIfRequested();
    }
    const last = Math.max(1, Math.ceil(result.works.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), last);
    if (currentPage !== page && stillOnPage()) {
      const { path, query, hash } = owner.$route;
      owner.$router.replace({ path, query: { ...query, page: currentPage }, hash }).catch(() => {});
    }
    const start = (currentPage - 1) * pageSize;
    const rows = result.works.slice(start, start + pageSize);
    if (rows.length && ((index.fromCache && owner.loggedIn) || owner.requestParams.withPlaylistStatus?.length)) {
      const refresh = owner.$axios.CancelToken.source();
      stateRefresh = refresh;
      // 卡片和准确分页先返回。标记单独刷新，旧标记在刷新完成前不显示。
      void refreshPageState(owner, result, start, rows, refresh.token,
        () => !refresh.token.reason && state.index === index && stillOnPage()).then(async (valid) => {
        if (valid || refresh.token.reason) return;
        await removeSoloCache(key);
        if (state.index !== index || !stillOnPage()) return;
        discard();
        owner.requestWorksQueue(false);
      }).catch((err) => {
        if (!refresh.token.reason) console.warn(LOG_PREFIX, '单人作品当前页标记刷新失败', err);
      });
    }
    return {
      data: {
        works: rows,
        pagination: { ...result.pagination, currentPage, pageSize, totalCount: result.works.length },
      },
    };
  };
  owner.makeMainRequest = function (token) {
    stateRefresh?.cancel('Page changed');
    if (!soloEnabled(owner)) {
      if (state.index && !state.index.ready) discard();
      // 普通浏览原样返回原站 Promise，不经脚本 await 或转接响应对象。
      return nativeRequest.call(this, token);
    }
    return requestSolo(token);
  };
  owner.$watch(() => [soloEnabled(owner), searchQuery(owner).key], ([enabled, key], [wasEnabled]) => {
    stateRefresh?.cancel('Search changed');
    if (state.index && (state.index.key !== key || !hasSingleActor(owner) || (!enabled && !state.index.ready))) discard();
    if (enabled !== wasEnabled && owner.$route?.path === '/works') owner.requestWorksQueue();
    schedule();
  });
  // 绑定时原站请求可能已经在途中。只接收其完成的数据，不触发任何预取。
  owner.$watch(() => owner.loading, (loading) => {
    if (!loading && hasSingleActor(owner) && !soloEnabled(owner)) {
      captureNative({ works: owner.works, pagination: owner.pagination }, searchQuery(owner).key);
    }
  });
  owner.$once('hook:beforeDestroy', () => { stateRefresh?.cancel('Page closed'); discard(); });
  if (soloEnabled(owner)) owner.requestWorksQueue();
  return state;
}

function worksOwner(heading) {
  for (let node = heading; node; node = node.parentElement) {
    for (let owner = node.__vue__; owner; owner = owner.$parent) {
      if (owner.$options?.name === 'Works' && typeof owner.$options.methods?.makeMainRequest === 'function' &&
          typeof owner.requestWorksQueue === 'function' && typeof owner.$axios?.CancelToken?.source === 'function') return owner;
    }
  }
  return null;
}

const soloWorksFeature = {
  name: 'solo works',
  init(vm) {
    GM_addStyle(`
      .row.aop-solo-toolbar { justify-content: flex-start; align-items: center; gap: 6px 10px; }
      .aop-solo-toolbar > :last-child { margin-inline-start: auto; }
      .aop-solo-works { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        min-height: 36px; padding: 0 12px; border: 1px solid rgba(0, 0, 0, .24); border-radius: 20px;
        background: transparent; color: inherit; font: inherit; white-space: nowrap; cursor: pointer; }
      .body--dark .aop-solo-works { border-color: rgba(255, 255, 255, .4); }
      .aop-solo-works .material-icons { font-size: 18px; }
      .aop-solo-works:hover { background: rgba(127, 127, 127, .1); }
      .aop-solo-works[aria-pressed="true"] { color: var(--q-color-primary, #1976d2); border-color: currentColor;
        background: rgba(25, 118, 210, .1); }
      .body--dark .aop-solo-works[aria-pressed="true"] { color: #90caf9; }
      .aop-solo-works:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .aop-solo-indexing h1.text-h5 + span,
      .aop-solo-indexing .q-page > .q-mt-lg.q-mb-xl.text-center,
      .aop-solo-indexing .q-page > .q-pt-lg.q-pb-md.flex-center { display: none !important; }
    `);
    const doc = pageWindow.document;
    const bindings = new WeakMap();
    let mountedToolbar;
    let indexingRoot;
    const label = el('span');
    const loading = el('span', { class: 'text-caption', role: 'status' });
    const control = el('button', { type: 'button', class: 'aop-solo-works', onkeydown: (event) => {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
    }, onclick: () => {
      const route = vm.$route;
      if (route.path !== '/works' || !mountedToolbar) return;
      const query = { ...route.query };
      delete query.page;
      if (query[SOLO_QUERY] === '1') delete query[SOLO_QUERY];
      else query[SOLO_QUERY] = '1';
      vm.$router.push({ path: route.path, query, hash: route.hash }).catch(() => {});
    } }, [el('i', { class: 'material-icons', 'aria-hidden': 'true' }, 'person'), label]);
    const ensure = () => {
      const route = vm.$route;
      const heading = route?.path === '/works' && doc.querySelector('.q-page-container h1.text-h5');
      const owner = heading && worksOwner(heading);
      let state;
      if (owner && hasSingleActor(owner)) {
        if (!bindings.has(owner)) bindings.set(owner, bindWorks(owner, schedule));
        state = bindings.get(owner);
      }
      const enabled = Boolean(state && soloEnabled(owner));
      const toolbar = state && heading.parentElement.nextElementSibling?.querySelector('.q-page > .row.justify-between');
      if (toolbar !== mountedToolbar) {
        mountedToolbar?.classList.remove('aop-solo-toolbar');
        mountedToolbar = toolbar || null;
      }
      if (toolbar?.firstElementChild) {
        toolbar.classList.add('aop-solo-toolbar');
        if (toolbar.firstElementChild.nextElementSibling !== control) toolbar.firstElementChild.after(control);
        control.setAttribute('aria-pressed', String(enabled));
        const text = tr('soloWorksOnly');
        if (label.textContent !== text) label.textContent = text;
      } else {
        control.remove();
      }
      const indexing = Boolean(enabled && state.index && !state.index.ready);
      const root = indexing ? owner.$el : null;
      if (root !== indexingRoot) {
        indexingRoot?.classList.remove('aop-solo-indexing');
        indexingRoot = root;
        indexingRoot?.classList.add('aop-solo-indexing');
      }
      if (toolbar?.firstElementChild && indexing) {
        const text = tr(owner.works.length ? 'soloWorksLoadingPages' : 'soloWorksLoading');
        if (loading.textContent !== text) loading.textContent = text;
        if (control.nextElementSibling !== loading) control.after(loading);
      } else loading.remove();
    };
    let scheduled = false;
    const schedule = () => {
      if (scheduled || (!mountedToolbar && vm.$route?.path !== '/works')) return;
      scheduled = true;
      pageWindow.requestAnimationFrame(() => {
        scheduled = false;
        try { ensure(); } catch (err) { console.error(LOG_PREFIX, '单人出演筛选', err); }
      });
    };
    new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
    vm.$watch(() => vm.$route, schedule);
    onLocaleChange(schedule);
    schedule();
  },
};

async function clearSoloWorksCache() {
  sharedIndex?.source.cancel('Solo cache cleared');
  sharedIndex = null;
  await clearSoloCache();
}

export { bindWorks, clearSoloWorksCache, loadSoloWorks, refreshPageState, soloWorksFeature };
