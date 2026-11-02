/*! 为原站播放器按钮补充原生悬停提示和无障碍名称；仅识别 AudioPlayer/AudioPlayerClassic 内的按钮。 */
import { onLocaleChange, tr } from "../core/i18n.js";
import { pageWindow } from "../core/runtime.js";
import { currentTrack } from "../player/state.js";

const PLAY_MODE_ICONS = new Set(['playlist_play', 'repeat', 'repeat_one', 'shuffle']);

function playerButtonContext(button) {
  let icon = null;
  for (let component = button.__vue__; component; component = component.$parent) {
    if (component._isDestroyed) return null;
    if (component.$el === button && typeof component.$props?.icon === 'string') icon = component.$props.icon;
    if (['AudioPlayer', 'AudioPlayerClassic'].includes(component.$options?.name)) {
      return { player: component, icon: icon || button.querySelector('.q-icon')?.textContent.trim() };
    }
  }
  return null;
}

const playerHintsFeature = {
  name: 'player-hints',
  label(button) {
    const context = playerButtonContext(button);
    if (!context) return null;
    const { player, icon } = context;
    if (icon === 'queue_music') return tr('playerQueue');
    if (PLAY_MODE_ICONS.has(icon)) {
      const mode = player.playMode?.name || this.vm.$store.state.AudioPlayer.playMode?.name || 'order';
      const names = tr('playerModeNames');
      return tr('playerModeHint', names[mode] || names.order);
    }
    if (icon === 'picture_in_picture_alt') {
      const mode = player.subtitleDisplayMode || this.vm.$store.state.AudioPlayer.subtitleDisplayMode;
      return tr(mode === 'pip' ? 'playerInlineSubtitles' : 'playerDesktopSubtitles');
    }
    if (icon === 'subtitles') {
      const track = player.currentPlayingFile || currentTrack(this.vm.$store.state);
      return tr(track?.availableLyrics?.length ? 'playerSelectSubtitles' : 'playerLoadSubtitles');
    }
    if (icon === 'more_horiz') return tr('playerMoreActions');
    return null;
  },
  update(button) {
    const label = this.label(button);
    if (!label) return;
    if (button.getAttribute('title') !== label) button.setAttribute('title', label);
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  },
  init(vm) {
    this.vm = vm;
    const doc = pageWindow.document;
    const ensure = () => {
      for (const button of doc.querySelectorAll('.q-btn')) this.update(button);
    };
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      pageWindow.requestAnimationFrame(() => { scheduled = false; ensure(); });
    };
    // Vue 会重建播放器、切换图标；仅监听子节点与文本变化，避免 title 写入触发自身循环。
    new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true, characterData: true });
    vm.$store.subscribe((mutation) => {
      if (['AudioPlayer/CHANGE_PLAY_MODE', 'AudioPlayer/SET_SUBTITLE_DISPLAY_MODE'].includes(mutation.type)) schedule();
    });
    const updateHovered = (event) => {
      const button = event.target?.closest?.('.q-btn');
      if (button) this.update(button);
    };
    doc.addEventListener('mouseover', updateHovered, true);
    doc.addEventListener('focusin', updateHovered, true);
    onLocaleChange(ensure);
    ensure();
  },
};

export { playerHintsFeature };
