/*! 持久化统一入口：aop: 前缀下的 GM 存储独立于网站账号，同一已安装脚本可跨匹配域名读取。 */
const storage = {
  get(key, fallback) {
    return GM_getValue(`aop:${key}`, fallback);
  },
  set(key, value) {
    GM_setValue(`aop:${key}`, value);
  },
  remove(key) {
    GM_deleteValue(`aop:${key}`);
  },
};

export { storage };
