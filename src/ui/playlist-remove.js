/*! 原站收藏夹移出确认：捕获阶段拦住原点击，确认后只向仍存在的作品卡片发送一次 delete。 */
import { onLocaleChange, tr } from "../core/i18n.js";
import { pageWindow } from "../core/runtime.js";

function playlistRemoveButton(node) {
  for (let n = node; n && n.classList; n = n.parentElement) {
    if (!n.classList.contains('like-btn')) continue;
    const icon = n.querySelector('.q-icon');
    return icon && icon.textContent.trim() === 'playlist_remove' ? n : null;
  }
  return null;
}

function playlistRemoveCard(button) {
  for (const node of [button, ...button.querySelectorAll('*')]) {
    for (let comp = node.__vue__; comp; comp = comp.$parent) {
      if (comp.$props && 'showDeleteBtn' in comp.$props) return comp;
    }
  }
  return null;
}

const playlistRemoveGuard = {
  vm: null,
  confirm(message, onOk) {
    const q = this.vm && this.vm.$q;
    if (q && typeof q.dialog === 'function') {
      q.dialog({
        title: tr('playlistRemoveTitle'),
        message,
        cancel: { label: tr('cancel'), flat: true },
        ok: { label: tr('playlistRemoveOk'), color: 'negative', flat: true },
        focus: 'cancel',
      }).onOk(onOk);
    } else if (pageWindow.confirm(message)) {
      onOk();
    }
  },
  onClick(event) {
    const button = playlistRemoveButton(event.target);
    if (!button) return;
    const card = playlistRemoveCard(button);
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const metadata = card.$props.metadata;
    this.confirm(tr('playlistRemoveConfirm', metadata && metadata.source_id), () => {
      if (!card._isDestroyed) card.$emit('delete');
    });
  },
  label(root = pageWindow.document) {
    const hint = tr('playlistRemoveHint');
    for (const node of root.querySelectorAll('.like-btn')) {
      if (playlistRemoveButton(node) !== node) continue;
      if (node.getAttribute('title') !== hint) node.setAttribute('title', hint);
      if (node.getAttribute('aria-label') !== hint) node.setAttribute('aria-label', hint);
    }
  },
};

const playlistRemoveFeature = {
  name: 'playlist-remove-guard',
  init(vm) {
    playlistRemoveGuard.vm = vm;
    pageWindow.document.addEventListener('click', (event) => playlistRemoveGuard.onClick(event), true);
    const label = () => playlistRemoveGuard.label();
    label();
    new MutationObserver(label).observe(pageWindow.document.body, { childList: true, subtree: true });
    onLocaleChange(label);
  },
};

export { playlistRemoveFeature };
