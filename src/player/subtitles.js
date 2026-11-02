/*! 字幕适配：补载所选字幕、识别文本编码，并在续播/跳转后同步网站的 LRC 解析器。 */
import { tr } from "../core/i18n.js";
import { LOG_PREFIX, notify } from "../core/runtime.js";
import { currentTrack } from "./state.js";

function decodeSubtitle(bytes, charset) {
  const decode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch (err) {
      return null;
    }
  };
  if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  if (charset) return new TextDecoder(charset, { fatal: true }).decode(bytes);
  const utf8 = decode('utf-8');
  if (utf8 != null) return utf8;
  // 某些 GB 编码文本也能被当成 Shift-JIS 解码；半角片假名检测只是启发式，勿当作可靠编码识别。
  const sjis = decode('shift_jis');
  if (sjis != null && !/[\uFF61-\uFF9F]/.test(sjis)) return sjis;
  const gb = decode('gb18030');
  if (gb != null) return gb;
  if (sjis != null) return sjis;
  throw new Error('无法识别字幕编码');
}

function createSubtitleSync(vm) {
  let component = null, parser = null, content = null, hash = null, time = null;
  let scheduled = false, force = false;
  let pending = null, failed = null;
  const loadSelected = (retry) => {
    const store = vm.$store, state = store.state;
    const queue = state.AudioPlayer.queue, index = state.AudioPlayer.queueIndex;
    const track = queue[index], lyricIndex = track?.selectedLyricIndex;
    const lyric = track?.availableLyrics?.[lyricIndex];
    // 切换音轨、字幕或关闭字幕时取消旧请求；返回时还会再次校验队列和选中项。
    if (pending && (pending.track !== track || pending.lyric !== lyric || state.Settings?.enableSubtitle === false)) {
      pending.controller.abort();
      pending = null;
    }
    if (state.Settings?.enableSubtitle === false || !lyric || lyric.content || !lyric.mediaDownloadUrl || pending) return;
    if (failed === lyric && !retry) return;
    const controller = new AbortController();
    const request = { track, lyric, controller };
    pending = request;
    (async () => {
      try {
        const url = new URL(lyric.mediaDownloadUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('不支持的字幕地址');
        // 字幕地址由作品数据提供；不附带网站 JWT、Cookie 或 Referer，也不跟随重定向。
        const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok) throw new Error('字幕请求失败');
        const buffer = await response.arrayBuffer(), bytes = new Uint8Array(buffer);
        const charset = response.headers?.get('content-type')?.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
        const text = decodeSubtitle(bytes, charset);
        if (controller.signal.aborted || state.Settings?.enableSubtitle === false || !text || state.AudioPlayer.queue !== queue || queue[index] !== track || state.AudioPlayer.queueIndex !== index || track.availableLyrics?.[lyricIndex] !== lyric || track.selectedLyricIndex !== lyricIndex) return;
        store.commit('AudioPlayer/SET_LYRIC_CONTENT', { content: text, forQueueIndex: index, forSelectedLyricIndex: lyricIndex });
        failed = null;
      } catch (err) {
        if (controller.signal.aborted) return;
        const firstFailure = failed !== lyric;
        failed = lyric;
        console.error(LOG_PREFIX, '字幕正文加载失败');
        if (firstFailure && currentTrack(state) === track) notify(vm, tr('subtitleLoadFailed'));
      } finally {
        if (pending === request) pending = null;
      }
    })();
  };
  const find = () => {
    if (component && !component._isDestroyed) return component;
    const nodes = [vm.$root || vm], seen = new Set();
    while (nodes.length) {
      const node = nodes.pop();
      if (!node || seen.has(node) || node._isDestroyed) continue;
      seen.add(node);
      if (node.$options?.name === 'AudioElement') return (component = node);
      nodes.push(...(node.$children || []));
    }
    return null;
  };
  return (type) => {
    if (!['SET_CURRENT_TIME', 'SET_LYRIC_CONTENT', 'SET_LYRIC_INDEX', 'SET_LYRIC_INDEX_AUTO', 'SET_QUEUE', 'SET_TRACK', 'NEXT_TRACK', 'PREVIOUS_TRACK', 'EMPTY_QUEUE', 'REMOVE_FROM_QUEUE', 'ON_PLAY', 'ON_PAUSE', 'WANT_SEEK', 'SUBTITLE_SETTING'].includes(type)) return;
    force ||= type !== 'SET_CURRENT_TIME';
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      const mustSync = force;
      force = false;
      try {
        loadSelected(mustSync);
        const audio = find();
        if (!audio?.lrcObj || typeof audio.updateLyricPos !== 'function') return;
        const text = audio.lyricContent || '';
        const trackHash = currentTrack(vm.$store.state)?.hash;
        const changed = parser !== audio.lrcObj || content !== text || hash !== trackHash;
        if (changed) {
          parser = audio.lrcObj;
          content = text;
          hash = trackHash;
          time = null;
          if (text) parser.setLyric(text);
        }
        if (!text) return;
        const currentTime = audio.player?.currentTime;
        if (!Number.isFinite(currentTime) || currentTime < 0) return;
        if (changed || mustSync || time == null || Math.abs(currentTime - time) > 1.5) audio.updateLyricPos(currentTime);
        time = currentTime;
      } catch (err) {
        console.error(LOG_PREFIX, '字幕同步失败', err);
      }
    };
    if (typeof vm.$nextTick === 'function') vm.$nextTick(run);
    else Promise.resolve().then(run);
  };
}

export { createSubtitleSync };
