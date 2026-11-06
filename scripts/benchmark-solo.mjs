// 手动运行的公开 API 基准，不属于 npm test，也不读取浏览器账号或登录令牌。
// node scripts/benchmark-solo.mjs [声优名] [旧模块文件路径] [API 地址]
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.window = { location: { hostname: 'asmr.one' } };
const actor = process.argv[2] || '柚木つばめ';
const keyword = `$va:${actor}$`;
const api = process.argv[4] || 'https://api.asmr.one';
if (!['https://api.asmr.one', 'https://api.asmr-100.com', 'https://api.asmr-200.com', 'https://api.asmr-300.com'].includes(api)) throw new Error('Unknown API');
const token = { throwIfRequested() {} };
let requests = 0;
let active = 0;
let peak = 0;
const raw = async function () {
  requests++;
  active++;
  peak = Math.max(peak, active);
  try {
    const params = new URLSearchParams({ ...this.requestParams, includeTranslationWorks: 'true' });
    const response = await fetch(`${api}/api/search/${encodeURIComponent(this.keyword)}?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return { data: await response.json() };
  } finally { active--; }
};
const owner = { keyword, globalFilter: '', requestParams: { order: 'release', sort: 'desc' }, $options: { methods: { makeMainRequest: raw } } };
const nativeStart = performance.now();
const { data: seed } = await raw.call({ ...owner, requestParams: { ...owner.requestParams, page: 1, pageSize: 20 } });
console.log(JSON.stringify({ actor, api, nativeMs: Math.round(performance.now() - nativeStart), sourceTotal: seed.pagination.totalCount }));
const modules = process.argv[3] ? [['before', pathToFileURL(resolve(process.argv[3])).href], ['after', new URL('../src/ui/solo-works.js', import.meta.url).href]]
  : [['current', new URL('../src/ui/solo-works.js', import.meta.url).href]];
let previous;
for (const [mode, path] of modules) {
  const { loadSoloWorks } = await import(path);
  requests = 0;
  peak = 0;
  let first;
  const start = performance.now();
  const result = await loadSoloWorks(owner, owner.requestParams, token, (works) => {
    if (first === undefined && works.length >= 20) first = performance.now() - start;
  }, 100, seed);
  const hash = createHash('sha256').update(JSON.stringify(result.works.map((work) => work.id))).digest('hex');
  const totalDataMs = Math.round(performance.now() - start);
  console.log(JSON.stringify({ mode, firstPageDataMs: Math.round(first ?? totalDataMs), totalDataMs, requests,
    maxConcurrent: peak, soloTotal: result.works.length, orderedIdsHash: hash, matchesPrevious: previous ? hash === previous : undefined }));
  previous = hash;
}
