/*! 历史页面与实时进度展示。页面销毁时解除 Vuex/语言订阅，避免反复进入后重复监听。 */
import { getApiBase } from "../core/api.js";
import { formatAgo, onLocaleChange, tr } from "../core/i18n.js";
import { el, formatTime, pageWindow } from "../core/runtime.js";
import { historyStore } from "./store.js";
import { isFinished } from "../player/progress-store.js";
import { resumeFromHistory } from "../player/resume.js";
import { currentTrack, trackWorkInfo } from "../player/state.js";
import { ICONS, addNavItem, addPage } from "../ui/navigation.js";

const HISTORY_PATH = '/history';

const LIVE_MUTATIONS = [
  'AudioPlayer/SET_CURRENT_TIME',
  'AudioPlayer/SET_DURATION',
  'AudioPlayer/ON_PLAY',
  'AudioPlayer/ON_PAUSE',
  'AudioPlayer/SET_TRACK',
  'AudioPlayer/SET_QUEUE',
];

const historyView = {
  mount(vm) {
    GM_addStyle(`
      .aop-fab { position: fixed; top: 9px; left: 50%; transform: translateX(-50%); z-index: 9999;
        border: 1px solid rgba(255,255,255,.7); border-radius: 16px; padding: 4px 14px;
        background: rgba(255,255,255,.15); color: #fff; font-size: 14px; cursor: pointer; }
      .aop-panel { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); z-index: 9999; width: 480px; max-width: calc(100vw - 32px);
        max-height: 70vh; overflow-y: auto; background: #fff; color: #222; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }

    `);

    this.vm = vm;
    this.panel = null;
    const hasPage = addPage(vm, { path: HISTORY_PATH, title: () => `${tr('history')} - ASMR Online`, renderInto: (container) => this.mountLive(container) });
    const open = hasPage ? () => vm.$router.push(HISTORY_PATH).catch(() => {}) : () => this.togglePanel();
    const inNav = addNavItem({
      id: 'history',
      label: () => tr('history'),
      iconSvg: ICONS.history,
      href: hasPage ? HISTORY_PATH : null,
      onClick: open,
      isActive: () => vm.$route && vm.$route.path === HISTORY_PATH,
      after: ['[data-aop-nav="favorites"]', '/playlists'],
      onInsert: () => {
        const fab = pageWindow.document.querySelector('.aop-fab');
        if (fab) fab.remove();
      },
    });
    if (!inNav) {
      setTimeout(() => {
        if (!pageWindow.document.querySelector('[data-aop-nav="history"]')) {
          const fab = el('button', { class: 'aop-fab', onclick: open }, tr('history'));
          onLocaleChange(() => { fab.textContent = tr('history'); });
          pageWindow.document.body.append(fab);
        }
      }, 5000);
    }
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(tr('history'), open);
  },

  togglePanel() {
    if (this.panel) {
      this.panelCleanup();
      this.panel.remove();
      this.panel = null;
    } else {
      this.panel = el('div', { class: 'aop-panel aop-page' });
      this.panelCleanup = this.mountLive(this.panel);
      pageWindow.document.body.append(this.panel);
    }
  },

  mountLive(container) {
    this.container = container;
    this.renderInto(container);
    const stopLocale = onLocaleChange(() => this.renderInto(container));
    let lastRenderAt = 0;
    const stop = this.vm.$store.subscribe((mutation, state) => {
      if (!LIVE_MUTATIONS.includes(mutation.type)) return;
      const track = currentTrack(state);
      if (!track) return;
      const player = state.AudioPlayer;
      const { workId } = trackWorkInfo(track);
      const first = container.querySelector('.aop-row');
      const row = container.querySelector(`.aop-row[data-work-id="${workId}"]`);
      if (!row || row !== first) {
        const saved = historyStore.all()[0];
        if (saved && saved.workId === workId && (mutation.type !== 'AudioPlayer/SET_CURRENT_TIME' || Date.now() - lastRenderAt > 1000)) {
          lastRenderAt = Date.now();
          this.renderInto(container);
        }
        return;
      }
      // 当前作品已在首行时只更新对应字段，避免每次时间事件都重建列表。
      this.patchRow(row, { trackTitle: track.title || '', t: player.currentTime, d: player.duration, playing: player.playing });
    });
    return () => { stop(); stopLocale(); if (this.container === container) this.container = null; };
  },

  patchRow(row, { trackTitle, t, d, playing }) {
    const finished = isFinished(t, d);
    row.querySelector('.aop-track').textContent = tr('trackLine', playing, trackTitle);
    row.querySelector('.aop-track').title = trackTitle;
    row.querySelector('.aop-fill').style.width = `${finished ? 100 : d ? Math.min(100, (t / d) * 100) : 0}%`;
    row.querySelector('.aop-time').textContent = finished ? tr('finished') : d ? `${formatTime(t)} / ${formatTime(d)}` : formatTime(t);
    row.querySelector('.aop-when').textContent = `${row.dataset.sourceId} · ${playing ? tr('nowPlaying') : formatAgo(Date.now())}`;
    row.querySelector('.aop-resume').textContent = finished ? tr('replay') : tr('resume');
  },

  groupLabel(timestamp) {
    const day = (t) => new Date(t).toDateString();
    const now = Date.now();
    if (day(timestamp) === day(now)) return tr('today');
    if (day(timestamp) === day(now - 86400000)) return tr('yesterday');
    return tr('earlier');
  },

  renderInto(container) {
    const vm = this.vm;
    const rerender = () => this.renderInto(container);
    const openWork = (entry) => vm.$router.push(`/work/${entry.sourceId}`);
    const entries = historyStore.all();

    const row = (entry) => {
      const finished = isFinished(entry.t, entry.d);
      const percent = entry.d ? Math.min(100, (entry.t / entry.d) * 100) : 0;
      return el('div', { class: 'aop-row', 'data-work-id': String(entry.workId), 'data-source-id': entry.sourceId }, [
        el('img', { class: 'aop-cover', src: `${getApiBase(vm)}/api/cover/${entry.workId}.jpg?type=240x240`, loading: 'lazy', onclick: () => openWork(entry) }),
        el('div', { class: 'aop-info' }, [
          el('div', { class: 'aop-title', title: entry.workTitle, onclick: () => openWork(entry) }, entry.workTitle),
          el('div', { class: 'aop-sub aop-when' }, `${entry.sourceId} · ${formatAgo(entry.updatedAt)}`),
          el('div', { class: 'aop-sub aop-track', title: entry.trackTitle }, tr('trackLine', false, entry.trackTitle)),
          el('div', { class: 'aop-progress' }, [
            el('div', { class: 'aop-bar' }, el('div', { class: 'aop-fill', style: `width: ${finished ? 100 : percent}%` })),
            el('span', { class: 'aop-time' }, finished ? tr('finished') : entry.d ? `${formatTime(entry.t)} / ${formatTime(entry.d)}` : formatTime(entry.t)),
          ]),
        ]),
        el('div', { class: 'aop-actions' }, [
          el('button', { class: 'aop-btn aop-resume', onclick: () => {
            const track = currentTrack(vm.$store.state);
            if (track && trackWorkInfo(track).workId === entry.workId) {
              return resumeFromHistory(vm, { ...trackWorkInfo(track), trackHash: track.hash });
            }
            const latest = historyStore.all().find((item) => item.workId === entry.workId);
            if (latest) return resumeFromHistory(vm, latest);
          } }, finished ? tr('replay') : tr('resume')),
          el('button', { class: 'aop-btn aop-flat', title: tr('removeFromHistory'), onclick: () => {
            if (!pageWindow.confirm(tr('confirmRemoveHistory'))) return;
            historyStore.remove(entry.workId);
            rerender();
          } }, tr('remove')),
        ]),
      ]);
    };

    const body = [];
    let currentGroup = null;
    let card = null;
    for (const entry of entries) {
      const label = this.groupLabel(entry.updatedAt);
      if (label !== currentGroup) {
        currentGroup = label;
        card = el('div', { class: 'aop-card' });
        body.push(el('div', { class: 'aop-date-group' }, label), card);
      }
      card.append(row(entry));
    }

    container.replaceChildren(
      el('div', { class: 'aop-head' }, [
        el('h1', {}, tr('history')),
        el('span', { class: 'aop-count' }, tr('workCount', entries.length)),
        el('span', { class: 'aop-spacer' }),
        entries.length
          ? el('button', { class: 'aop-btn aop-flat', onclick: () => { if (pageWindow.confirm(tr('confirmClearHistory'))) { historyStore.clear(); rerender(); } } }, tr('clearHistory'))
          : null,
        this.panel ? el('button', { class: 'aop-btn aop-flat', onclick: () => this.togglePanel() }, tr('close')) : null,
      ]),
      ...(body.length ? body : [el('div', { class: 'aop-card' }, el('div', { class: 'aop-empty' }, tr('historyEmpty')))]),
    );
  },
};

export { LIVE_MUTATIONS, historyView };
