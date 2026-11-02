/*! 数据管理独立页面：备份的唯一界面入口，并提供全部进度/全部脚本数据的清除操作。 */
import { onLocaleChange, tr } from "../core/i18n.js";
import { el, pageWindow } from "../core/runtime.js";
import { backupFeature } from "./backup.js";
import { progressActions } from "./progress-actions.js";
import { favoritesStore } from "../follows/store.js";
import { historyStore } from "../history/store.js";
import { progressStore } from "../player/progress-store.js";
import { ICONS, addNavItem, addPage } from "../ui/navigation.js";

const DATA_PATH = '/script-data';

const dataManagementFeature = {
  name: 'data-management',
  init(vm) {
    this.vm = vm;
    GM_addStyle(`
      .aop-data-card { overflow: visible; }
      .aop-data-row { display: flex; align-items: center; justify-content: space-between; gap: 20px;
        padding: 20px; border-bottom: 1px solid rgba(128,128,128,.2); }
      .aop-data-row:last-child { border-bottom: none; }
      .aop-data-hint { margin: 0; font-size: 14px; line-height: 1.6; }
      .aop-data-actions { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 12px; max-width: 100%; }
      .aop-data-actions .aop-backup-menu { left: auto; right: 0; max-width: calc(100vw - 56px); }
      .aop-data-actions .aop-data-button { display: flex; align-items: center; justify-content: center;
        box-sizing: border-box; width: 180px; max-width: 100%; min-height: 36px; padding: 6px 14px;
        font-size: 13px; line-height: 22px; background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.5); }
      .aop-data-actions .aop-data-danger { color: #c10015; border-color: currentColor; }
      .body--dark .aop-data-actions .aop-data-danger { color: #ff8a80; }
      .aop-data-actions .aop-data-button:hover { background: rgba(128,128,128,.1); }
      .aop-data-actions .aop-data-button:focus-visible { outline: 2px solid #1976d2; outline-offset: 2px; }
      @media (max-width: 700px) {
        .aop-data-row { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; }
        .aop-data-actions .aop-backup-menu { left: 0; right: auto; }
      }
    `);
    const hasPage = addPage(vm, {
      path: DATA_PATH,
      title: () => `${tr('dataManagement')} - ASMR Online`,
      renderInto: (container) => this.mountLive(container),
    });
    if (!hasPage) return;
    addNavItem({
      id: 'data',
      label: () => tr('dataManagement'),
      iconSvg: ICONS.data,
      href: DATA_PATH,
      onClick: () => vm.$router.push(DATA_PATH).catch(() => {}),
      isActive: () => vm.$route?.path === DATA_PATH,
      after: '[data-aop-nav="history"]',
    });
  },
  mountLive(container) {
    this.renderInto(container);
    return onLocaleChange(() => this.renderInto(container));
  },
  renderInto(container) {
    const row = (hint, actions) => el('div', { class: 'aop-data-row' }, [
      el('p', { class: 'aop-data-hint' }, hint),
      el('div', { class: 'aop-data-actions' }, actions),
    ]);
    container.replaceChildren(
      el('div', { class: 'aop-head' }, el('h1', {}, tr('dataManagement'))),
      el('section', { class: 'aop-card aop-data-card', 'data-aop-data': '' }, [
        row(tr('backupHint'), backupFeature.buttons(this.vm)),
        row(tr('clearProgressHint'), el('button', {
          type: 'button', class: 'aop-btn aop-data-button', onclick: () => progressActions.clearAll(this.vm),
        }, tr('clearProgress'))),
        row(tr('clearAllHint'), el('button', {
          type: 'button', class: 'aop-btn aop-data-button aop-data-danger',
          onclick: () => {
            if (!pageWindow.confirm(tr('clearAllConfirm'))) return;
            historyStore.clear();
            progressStore.clearAll();
            favoritesStore.clear();
            pageWindow.location.reload();
          },
        }, tr('clearAllMenu'))),
      ]),
    );
  },
};

export { dataManagementFeature };
