/*! 网站播放器状态适配：队列读取、作品标识和目录展开集中在这里。 */
function currentTrack(state) {
  const player = state.AudioPlayer;
  if (!player || !Array.isArray(player.queue)) return null;
  const track = player.queue[player.queueIndex];
  return track && track.hash ? track : null;
}

function trackWorkInfo(track) {
  const work = track.work || {};
  const workId = Number(work.id || String(track.hash).split('/')[0]);
  const sourceId = work.source_id || `RJ${String(workId).padStart(workId >= 1000000 ? 8 : 6, '0')}`;
  return { workId, sourceId, workTitle: track.workTitle || sourceId };
}

function playbackFiles(tree, audio = [], lyrics = []) {
  for (const node of tree || []) {
    if (node.type === 'folder') playbackFiles(node.children, audio, lyrics);
    else if (node.type === 'audio') audio.push({ ...node, availableLyrics: [], selectedLyricIndex: -1 });
    else if (node.type === 'text' && /\.(lrc|vtt|srt|ass)$/i.test(node.title || '')) {
      lyrics.push({ ...node, content: typeof node.content === 'string' ? node.content : '' });
    }
  }
  return { audio, lyrics };
}

/*! 异步续播请求的失效标记：切歌、清除或新的续播请求会递增，旧请求返回后不得覆盖新队列。 */
const resumeState = { requestId: 0 };

export { currentTrack, playbackFiles, resumeState, trackWorkInfo };
