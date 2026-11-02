/*! API 接入：优先采用网站配置，回退到当前域名的接口；目录、封面和历史续播共用此规则。 */
import { SITE_API_KEYS, siteHost } from "./runtime.js";

const API_URLS = {
  latest: 'https://api.asmr-200.com',
  original: 'https://api.asmr.one',
  'mirror-100': 'https://api.asmr-100.com',
  'mirror-200': 'https://api.asmr-200.com',
  'mirror-300': 'https://api.asmr-300.com',
};

const DEFAULT_API_BASE = API_URLS[SITE_API_KEYS[siteHost]];

/*! 此处的已知地址校验同时限制 JWT 的发送目标，不能直接信任任意 baseURL。 */
function getApiBase(vm) {
  const baseURL = vm.$axios && vm.$axios.defaults && vm.$axios.defaults.baseURL;
  if (typeof baseURL === 'string' && Object.values(API_URLS).includes(baseURL.replace(/\/+$/, ''))) return baseURL.replace(/\/+$/, '');
  const ls = vm.$q && vm.$q.localStorage;
  const key = ls && ls.getItem('apiUrlKey');
  return Object.hasOwn(API_URLS, key) ? API_URLS[key] : DEFAULT_API_BASE;
}

async function apiGet(vm, path, { fresh = false } = {}) {
  const ls = vm.$q && vm.$q.localStorage;
  const token = ls && ls.getItem('jwt-token');
  const res = await fetch(`${getApiBase(vm)}/api/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    ...(fresh ? { cache: 'no-store' } : {}),
  });
  if (!res.ok) throw new Error(`API ${path} 返回 ${res.status}`);
  return res.json();
}

export { apiGet, getApiBase };
