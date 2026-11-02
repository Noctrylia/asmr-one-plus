/*! 播放事件协调：实时位置先留在内存，定时或在暂停、切歌、离开页面时写入；界面可实时读取网站状态。 */
import { onLocaleChange, tr } from "../core/i18n.js";
import { LOG_PREFIX, el, formatTime, pageWindow } from "../core/runtime.js";
import { progressActions } from "../data/progress-actions.js";
import { historyStore } from "../history/store.js";
import { LIVE_MUTATIONS, historyView } from "../history/view.js";
import { SAVE_INTERVAL_MS, isFinished, progressSiblings, progressStore } from "./progress-store.js";
import { findAudioComponent, guardResetAutoplay } from "./media.js";
import { currentTrack, resumeState, trackWorkInfo } from "./state.js";
import { createSubtitleSync } from "./subtitles.js";

/*! 历史与进度分开：开始播放即可记录历史；正数位置即可保存，无需先播放满 5 秒；听完则移除续播进度。 */
function recordPosition(track, t, d) {
  if (!Number.isFinite(t) || t < 0) return;
  d = Number.isFinite(d) && d > 0 ? d : 0;
  if (isFinished(t, d)) progressStore.clear(track.hash, track.title, d);
  else if (t > 0) progressStore.save(track.hash, t, d, track.title);
  historyStore.touch({ ...trackWorkInfo(track), trackHash: track.hash, trackTitle: track.title || '', t, d });
}

const progressFeature = {
  name: 'progress',
  clearedHash: null,
  init(vm) {
    const store = vm.$store;
    const syncSubtitles = createSubtitleSync(vm);
    let lastSaveAt = 0;
    let resumedHash = null;
    // 保存包含 track 的快照，切歌后不能再从网站当前队列推断上一条音轨。
    let lastKnown = null;
    // 清除后的暂停/时间事件可能延迟到达，不能让这些事件把已删记录写回来。
    let forgottenHash = null;
    let recorded = null;
    let resetting = false;
    let resetMedia = null;
    let observedHash = currentTrack(store.state)?.hash;
    // 切歌时网站可能暂留上一条的 currentTime；收到新时间前，ON_PLAY 只能记录为 0。
    let positionReady = true;
    const record = (snapshot) => {
      if (recorded && recorded.hash === snapshot.track.hash && recorded.t === snapshot.t) return;
      recordPosition(snapshot.track, snapshot.t, snapshot.d);
      recorded = { hash: snapshot.track.hash, t: snapshot.t };
    };
    // 删除历史时保留独立的播放进度，但丢弃尚未落盘的历史快照，防止退出页面时重新添加。
    historyStore.onDelete((workId) => {
      resumeState.requestId++;
      const track = currentTrack(store.state);
      if (workId == null || (track && trackWorkInfo(track).workId === workId)) {
        lastKnown = null;
        recorded = null;
        forgottenHash = track && track.hash;
      }
    });

    const saveNow = () => {
      if (lastKnown) record(lastKnown);
      lastSaveAt = Date.now();
    };
    this.invalidate = () => {
      resumeState.requestId++;
      lastKnown = null;
      recorded = null;
      forgottenHash = currentTrack(store.state)?.hash;
      this.clearedHash = null;
    };
    /*! 清除当前音轨必须同时处理原生 audio 与 Vuex 状态，并让保存快照失效。
     * 重置期间忽略同步事件；重置后由 clearedHash 阻止迟到的自动播放，直到用户明确请求播放。
     */
    this.resetCurrent = (target = null) => {
      const track = currentTrack(store.state);
      if (target && !progressActions.matchesCurrent(vm, target)) return false;
      this.invalidate();
      if (!track) return false;
      this.clearedHash = track.hash;
      resumedHash = track.hash;
      const component = findAudioComponent(vm);
      guardResetAutoplay(component, () => this.clearedHash === currentTrack(store.state)?.hash);
      let media = component?.player?.media || component?.$el?.querySelector?.('audio');
      if (!media) {
        const audio = pageWindow.document.querySelectorAll('audio');
        if (audio.length === 1) media = audio[0];
      }
      resetMedia = media;
      resetting = true;
      try {
        store.commit('AudioPlayer/WANT_PAUSE');
        if (media && typeof media.pause === 'function') media.pause();
        if (media) {
          try { media.currentTime = 0; } catch {}
        }
        store.commit('AudioPlayer/SET_CURRENT_TIME', 0);
        store.commit('AudioPlayer/ON_PAUSE');
      } finally {
        resetting = false;
      }
      return true;
    };
    progressStore.onClear(() => this.resetCurrent());

    store.subscribe((mutation, state) => {
      if (resetting) return;
      if (mutation.type.startsWith('AudioPlayer/')) syncSubtitles(mutation.type.slice('AudioPlayer/'.length));
      else if (mutation.type === 'Settings/UPDATE_SETTING' && mutation.payload?.key === 'enableSubtitle') syncSubtitles('SUBTITLE_SETTING');
      const trackMutation = ['SET_QUEUE', 'SET_TRACK', 'NEXT_TRACK', 'PREVIOUS_TRACK', 'EMPTY_QUEUE', 'REMOVE_FROM_QUEUE'].some((type) => mutation.type === `AudioPlayer/${type}`);
      if (trackMutation) resumeState.requestId++;
      const track = currentTrack(state);
      /*! Vuex subscribe 在 mutation 执行后通知；此时队列已变化，要立即保存旧快照而不是读取新队列的时间。 */
      if (observedHash !== track?.hash) {
        if (lastKnown) record(lastKnown);
        lastKnown = null;
        observedHash = track?.hash;
        resumedHash = null;
        positionReady = false;
        lastSaveAt = Date.now();
      }
      if (!track) return;
      const player = state.AudioPlayer;

      // ON_PLAY 也可能由网站的缓冲事件触发，不能把它本身当作用户重新播放的意图。
      if (this.clearedHash === track.hash) {
        const playRequested = mutation.type === 'AudioPlayer/WANT_PLAY'
          || (mutation.type === 'AudioPlayer/TOGGLE_WANT_PLAYING' && !player.playing)
          || mutation.type === 'AudioPlayer/SET_TRACK'
          || (mutation.type === 'AudioPlayer/SET_QUEUE' && mutation.payload?.resetPlaying);
        if (playRequested) this.clearedHash = null;
        else if (mutation.type === 'AudioPlayer/ON_PLAY') {
          if (resetMedia && typeof resetMedia.pause === 'function') resetMedia.pause();
          store.commit('AudioPlayer/WANT_PAUSE');
          store.commit('AudioPlayer/ON_PAUSE');
          return;
        }
      }

      if (mutation.type === 'AudioPlayer/ON_PLAY') {
        forgottenHash = null;
        this.clearedHash = null;
        lastKnown = {
          track,
          t: positionReady && Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0,
          d: positionReady ? player.duration : track.duration,
        };
        record(lastKnown);
        lastSaveAt = Date.now();
      }

      if (mutation.type === 'AudioPlayer/SET_CURRENT_TIME') {
        if (track.hash === forgottenHash && !player.playing) return;
        forgottenHash = null;
        this.clearedHash = null;
        positionReady = true;
        lastKnown = { track, t: player.currentTime, d: player.duration };
      }

      // 等真实时长到达后再找续播进度；同一音轨只跳转一次，避免每次缓冲都拉回旧位置。
      if (mutation.type === 'AudioPlayer/SET_DURATION') {
        if (resumedHash === track.hash) return;
        resumedHash = track.hash;
        const saved = progressStore.find({ hash: track.hash, title: track.title, duration: player.duration });
        if (saved && saved.t > 0 && !isFinished(saved.t, player.duration)) {
          store.commit('AudioPlayer/WANT_SEEK', saved.t);
        }
      } else if (mutation.type === 'AudioPlayer/SET_CURRENT_TIME') {
        if (Date.now() - lastSaveAt >= SAVE_INTERVAL_MS) saveNow();
      } else if (mutation.type === 'AudioPlayer/ON_PAUSE') {
        saveNow();
      } else if (trackMutation) {
        resumedHash = null;
      }
    });

    pageWindow.addEventListener('pagehide', saveNow);
    pageWindow.document.addEventListener('visibilitychange', () => {
      if (pageWindow.document.visibilityState === 'hidden') saveNow();
    });

    historyView.mount(vm);
    trackHints.mount(vm);
  },
};

const trackHints = {
  mount(vm) {
    GM_addStyle(`
      .aop-track-hint { flex: none; display: flex; align-items: center; gap: 10px; margin-left: 16px;
        font-size: 12px; white-space: nowrap; }
      .aop-track-hint .aop-bar { flex: none; width: 120px; height: 4px; }
      .aop-track-clear { flex: none; min-height: 32px; padding: 5px 10px; border: 1px solid #b0bec5;
        border-radius: 4px; background: transparent; color: #455a64; font: inherit; font-weight: 500; cursor: pointer; }
      .aop-track-clear:hover { background: rgba(128,128,128,.15); }
      .aop-track-clear:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .body--dark .aop-track-clear { color: #eceff1; border-color: #78909c; }
      .q-item.bg-teal .aop-track-clear { color: #fff; border-color: rgba(255,255,255,.7); }
      .q-item.bg-teal .aop-track-hint .aop-fill { background: #fff; }
      @media (max-width: 600px) {
        .aop-track-hint { gap: 8px; margin-left: 8px; }
        .aop-track-hint .aop-bar { display: none; }
        .aop-track-clear { padding: 5px 8px; }
      }
    `);
    this.vm = vm;
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      pageWindow.requestAnimationFrame(() => {
        scheduled = false;
        try {
          this.ensure();
        } catch (err) {
          console.error(LOG_PREFIX, '音轨进度提示', err);
        }
      });
    };
    new MutationObserver(run).observe(pageWindow.document.body, { childList: true, subtree: true });
    progressStore.onChange(run);
    onLocaleChange(run);
    vm.$store.subscribe((mutation) => {
      if (LIVE_MUTATIONS.includes(mutation.type)) run();
    });
    run();
  },

  // 当前音轨直接用实时状态；其他音轨使用持久化进度，因此 UI 更新不依赖 5 秒写盘。
  positionOf(file) {
    const player = this.vm && this.vm.$store.state.AudioPlayer;
    if (progressFeature.clearedHash === file.hash && !player?.playing) return null;
    const playing = player && currentTrack(this.vm.$store.state);
    if (playing && playing.hash === file.hash && player.currentTime > 0) {
      return { t: player.currentTime, d: player.duration || file.duration || 0 };
    }
    if (!this.saved || this.savedVersion !== progressStore.version) {
      this.saved = progressStore.all();
      this.savedVersion = progressStore.version;
    }
    const all = this.saved;
    return all[file.hash] || all[progressSiblings(all, file)[0]] || null;
  },

  ensure() {
    const root = pageWindow.document.querySelector('#work-tree');
    let tree = null;
    for (let comp = root && root.__vue__; comp && comp.$el === root; comp = comp.$parent) {
      if (comp.$options && comp.$options.name === 'WorkTree') tree = comp;
    }
    if (!tree || !Array.isArray(tree.currentFolder)) return;
    for (const row of root.querySelectorAll('.q-item')) {
      // 网站 WorkTree 用数字 vnode key 对应 currentFolder 下标；DOM 行顺序不一定等于目录下标。
      let index = null;
      for (let comp = row.__vue__; comp && comp.$el === row; comp = comp.$parent) {
        if (typeof comp.$vnode?.key === 'number') index = comp.$vnode.key;
      }
      const file = index == null ? null : tree.currentFolder[index];
      let hint = [...row.children].find((child) => child.classList.contains('aop-track-hint'));
      let saved = null;
      if (file && file.type === 'audio' && file.hash) {
        saved = this.positionOf(file);
      }
      if (!saved) {
        if (hint) hint.remove();
        continue;
      }
      if (!hint) {
        hint = el('div', { class: 'aop-track-hint' }, [
          el('div', { class: 'aop-bar' }, el('div', { class: 'aop-fill' })),
          el('span', { class: 'aop-track-hint-text' }),
          progressActions.trackButton(this.vm, file),
        ]);
        row.append(hint);
      }
      progressActions.updateTrackButton(hint.querySelector('.aop-track-clear'), file);
      const d = saved.d || file.duration || 0;
      const width = `${d ? Math.min(100, (saved.t / d) * 100) : 0}%`;
      const text = tr('listenedTo', formatTime(saved.t));
      const label = hint.querySelector('.aop-track-hint-text');
      if (label.textContent !== text) label.textContent = text;
      const fill = hint.querySelector('.aop-fill');
      if (fill.style.width !== width) fill.style.width = width;
    }
  },
};

export { progressFeature };
