/*! 从历史恢复作品队列；真正的进度跳转由 progress 模块在收到时长后执行。 */
import { apiGet } from "../core/api.js";
import { tr } from "../core/i18n.js";
import { LOG_PREFIX, notify } from "../core/runtime.js";
import { playbackFiles, resumeState } from "./state.js";

async function resumeFromHistory(vm, entry) {
  const requestId = ++resumeState.requestId;
  try {
    const { audio, lyrics } = playbackFiles(await apiGet(vm, `tracks/${entry.workId}?v=2`));
    // 请求期间可能已切歌或清除数据；这时不能再用返回结果替换用户的新队列。
    if (requestId !== resumeState.requestId) return;
    const index = audio.findIndex((track) => track.hash === entry.trackHash);
    if (index < 0) throw new Error('作品里找不到这条音轨');
    if (lyrics.length && !vm.$store._actions?.['AudioPlayer/pushMultiLyricToQueue']) {
      throw new Error('网站的字幕匹配接口不可用');
    }
    if (vm.$store._mutations && vm.$store._mutations['AudioPlayer/LOAD_PLAYER']) vm.$store.commit('AudioPlayer/LOAD_PLAYER');
    // 字幕匹配使用网站自己的队列 action，必须先安装音轨队列，再提交字幕列表。
    vm.$store.commit('AudioPlayer/SET_QUEUE', { queue: audio, index, resetPlaying: true });
    if (lyrics.length) {
      try {
        await vm.$store.dispatch('AudioPlayer/pushMultiLyricToQueue', { lyrics });
      } catch (err) {
        console.error(LOG_PREFIX, err);
        if (vm.$store.state.AudioPlayer.queue === audio) notify(vm, tr('subtitleMatchFailed'));
      }
    }
  } catch (err) {
    if (requestId !== resumeState.requestId) return;
    console.error(LOG_PREFIX, err);
    notify(vm, tr('resumeFailed'));
    vm.$router.push(`/work/${entry.sourceId}`).catch(() => {});
  }
}

export { resumeFromHistory };
