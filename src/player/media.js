/*! 网站 AudioElement 适配：定位原生播放器，并抑制清除进度后由 canplay 引起的自动播放。 */
const guardedComponents = new WeakSet();

function findAudioComponent(vm) {
  const nodes = [vm.$root || vm], seen = new Set();
  while (nodes.length) {
    const component = nodes.pop();
    if (!component || seen.has(component) || component._isDestroyed) continue;
    seen.add(component);
    if (component.$options?.name === 'AudioElement') return component;
    nodes.push(...(component.$children || []));
  }
  return null;
}

function guardResetAutoplay(component, shouldStayPaused) {
  if (!component || guardedComponents.has(component) || typeof component.onCanplay !== 'function') return;
  const onCanplay = component.onCanplay;
  component.onCanplay = function (...args) {
    if (!shouldStayPaused() || !this.player) return onCanplay.apply(this, args);
    /*! 网站 onCanplay 会主动调用 player.play()。只在这次同步回调内屏蔽 play，
     * 保留原回调的时长、媒体信息更新，并在 finally 中恢复，避免阻断之后的手动播放。
     * 若网站将播放改成异步调用，需要重新检查这段拦截。
     */
    const player = this.player, play = player.play;
    player.play = () => Promise.resolve();
    try {
      return onCanplay.apply(this, args);
    } finally {
      player.play = play;
    }
  };
  guardedComponents.add(component);
}

export { findAudioComponent, guardResetAutoplay };
