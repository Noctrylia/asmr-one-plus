/*! 进度清除的用户操作层：负责确认、当前音轨重置和格式关联清除，不删除历史或关注。 */
import { tr } from "../core/i18n.js";
import { el, pageWindow } from "../core/runtime.js";
import { progressSiblings, progressStore } from "../player/progress-store.js";
import { progressFeature } from "../player/progress.js";
import { currentTrack } from "../player/state.js";

const progressActions = {
  matchesCurrent(vm, file) {
    const player = vm.$store.state.AudioPlayer;
    const track = currentTrack(vm.$store.state);
    if (!track) return false;
    if (track.hash === file.hash) return true;
    return progressSiblings({ [track.hash]: { title: track.title, d: player.duration || track.duration || 0, updatedAt: 0 } }, file).includes(track.hash);
  },
  clearTrack(vm, file) {
    if (!file?.hash) return;
    const notice = this.matchesCurrent(vm, file) ? `\n\n${tr('resetCurrentNotice')}` : '';
    if (!pageWindow.confirm(tr('confirmClearTrackProgress') + notice)) return;
    // 先使播放快照失效，再删除存储；顺序相反可能被暂停/时间事件立即写回。
    const reset = progressFeature.resetCurrent(file);
    const changed = progressStore.clear(file.hash, file.title, file.duration);
    if (reset && !changed) progressStore.changed();
  },
  clearAll(vm) {
    const notice = currentTrack(vm.$store.state) ? `\n\n${tr('resetCurrentNotice')}` : '';
    if (!pageWindow.confirm(tr('confirmClearProgress') + notice)) return;
    progressStore.clearAll();
  },
  trackButton(vm, file) {
    const button = el('button', {
      type: 'button',
      class: 'aop-track-clear',
      onclick: (event) => {
        event.stopPropagation();
        this.clearTrack(vm, button.aopFile);
      },
      oncontextmenu: (event) => event.stopPropagation(),
      onkeydown: (event) => event.stopPropagation(),
    });
    this.updateTrackButton(button, file);
    return button;
  },
  updateTrackButton(button, file) {
    button.aopFile = file;
    const label = `${tr('clearTrackProgress')}：${file.title || file.hash}`;
    if (button.getAttribute('aria-label') !== label) {
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const text = tr('clearTrackProgressButton');
    if (button.textContent !== text) button.textContent = text;
  },
};

export { progressActions };
