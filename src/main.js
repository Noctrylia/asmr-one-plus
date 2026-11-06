/*! 启动入口：等待网站 Vue 实例就绪，再初始化各功能；子页面的监听清理由各 view 模块负责。 */
import { SCRIPT_VERSION } from "./core/config.js";
import { watchLocale } from "./core/i18n.js";
import { LOG_PREFIX, SITE_API_KEYS, log, pageWindow, siteHost, waitForApp } from "./core/runtime.js";
import { dataManagementFeature } from "./data/view.js";
import { favoritesFeature } from "./follows/buttons.js";
import { progressFeature } from "./player/progress.js";
import { playlistRemoveFeature } from "./ui/playlist-remove.js";
import { playerHintsFeature } from "./ui/player-hints.js";
import { siteRenameFeature } from "./ui/site-rename.js";
import { soloWorksFeature } from "./ui/solo-works.js";
import { BASE_CSS } from "./ui/styles.js";

'use strict';

function main() {
  if (pageWindow.location.protocol !== 'https:' || !Object.hasOwn(SITE_API_KEYS, siteHost)) return;

  // progress 会注册历史入口；数据管理依赖该入口的位置，因此放在最后初始化。
  const features = [siteRenameFeature, progressFeature, favoritesFeature, soloWorksFeature, playlistRemoveFeature, playerHintsFeature, dataManagementFeature];

  pageWindow.document.documentElement.setAttribute('data-asmr-one-plus-version', SCRIPT_VERSION);
  log(`脚本 ${SCRIPT_VERSION} 已注入，等待网站加载…`);
  GM_addStyle(BASE_CSS);

  waitForApp()
    .then((vm) => {
      watchLocale(vm);
      for (const feature of features) {
        try {
          feature.init(vm);
        } catch (err) {
          console.error(LOG_PREFIX, `${feature.name} 启动失败`, err);
        }
      }
      log('已加载');
    })
    .catch((err) => console.error(LOG_PREFIX, err));
}

main();
