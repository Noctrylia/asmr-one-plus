/*! 原站命名修正：覆盖 i18n 文案、侧栏图标和页面标题，不改网站数据字段或接口。 */
import { pageWindow } from "../core/runtime.js";

let nativeNavigationIcons = null;

function syncNativeIcons() {
  const marks = [...pageWindow.document.querySelectorAll('a.q-item[href$="/favourites"] .q-icon')];
  const collections = [...pageWindow.document.querySelectorAll('a.q-item[href$="/playlists"] .q-icon')];
  if (!nativeNavigationIcons) {
    if (!marks[0]?.innerHTML.trim() || !collections[0]?.innerHTML.trim()) return;
    nativeNavigationIcons = { favourites: collections[0].innerHTML, playlists: marks[0].innerHTML };
  }
  for (const [path, icons] of [['favourites', marks], ['playlists', collections]]) {
    for (const icon of icons) {
      if (icon.innerHTML !== nativeNavigationIcons[path]) icon.innerHTML = nativeNavigationIcons[path];
      icon.setAttribute('data-aop-native-icon', path);
    }
  }
}

const SITE_RENAMES = {
  'zh-CN': {
    sidebar: { playlists: '收藏夹', myFavourites: '我的标记' },
    playlist: {
      addToPlaylist: '加入收藏夹',
      createPlaylist: '新建收藏夹',
      editPlaylist: '编辑收藏夹',
      deleteDialog: { title: '删除收藏夹', message: '删除后不可恢复，关注本收藏夹的人将无法再访问。确定要删除吗？' },
      filterOptions: { liked: '我关注的' },
      guestCanNotCreatePlaylist: '游客不能创建收藏夹',
      canNotCreatePreservedPlaylist: '不能创建系统保留的收藏夹',
      canNotDeletePreservedPlaylist: '不能删除系统保留的收藏夹',
      canNotLikeOwnPlaylist: '不能关注自己的收藏夹',
      playlistNotFound: '收藏夹不存在',
      preservedPlaylistName: { __SYS_PLAYLIST_MARKED: '快速收藏' },
    },
    settings: {
      quickMarkTarget: '默认收藏夹',
      quickMarkTargetCaption: '点击作品卡片右上角按钮后，作品将被添加到这个收藏夹',
      quickMarkTargetPlaylistReset: '默认收藏夹已重置为：{playlistName}',
    },
    favourites: { export: { exportToPlaylist: '导出到收藏夹', selectTargetPlaylist: '目标收藏夹' } },
    workTree: { addToPlayList: '加入播放队列' },
  },
  en: {
    sidebar: { playlists: 'Collections', myFavourites: 'My Marks' },
    playlist: {
      addToPlaylist: 'Add to collection',
      createPlaylist: 'Create collection',
      editPlaylist: 'Edit collection',
      deleteDialog: { title: 'Delete collection', message: 'This action cannot be undone. Are you sure you want to delete this collection?' },
      guestCanNotCreatePlaylist: 'Guests cannot create collections',
      canNotCreatePreservedPlaylist: 'Cannot create system built-in collection',
      canNotDeletePreservedPlaylist: 'Cannot delete system built-in collection',
      canNotLikeOwnPlaylist: 'Cannot follow your own collection',
      playlistNotFound: 'Collection not found',
      preservedPlaylistName: { __SYS_PLAYLIST_MARKED: 'Quick saves' },
    },
    settings: {
      quickMarkTarget: 'Default collection',
      quickMarkTargetCaption: 'If you click the quick-mark button in the top-right corner of a work card, it will be added to this collection.',
      quickMarkTargetPlaylistReset: 'The default collection has been reset to: {playlistName}.',
    },
    favourites: { export: { exportToPlaylist: 'Export to collection', selectTargetPlaylist: 'Target collection' } },
    workTree: { addToPlayList: 'Add to queue' },
  },
  ja: {
    sidebar: { playlists: 'コレクション', myFavourites: 'マーク' },
    playlist: { addToPlaylist: 'コレクションに追加', preservedPlaylistName: { __SYS_PLAYLIST_MARKED: 'クイック保存' } },
    workTree: { addToPlayList: 'キューに追加' },
  },
};

const SITE_TITLE_RENAMES = [
  { key: 'sidebar.playlists', original: 'Playlists', pattern: (names) => `^(?:${names}) - `, to: (name) => `${name} - ` },
  { key: 'sidebar.myFavourites', original: 'Favourites', pattern: (names) => `^(?:${names}) - `, to: (name) => `${name} - ` },
  { key: 'sidebar.playlists', original: 'Playlist by', pattern: (names) => ` \\| (?:${names}) `, to: (name) => ` | ${name} · `,
    renamed: (name) => `${name} ·` },
];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const messageAt = (messages, key) => key.split('.').reduce((o, k) => o && o[k], messages);

const siteRenameFeature = {
  name: 'site-rename',
  init(vm) {
    const i18n = vm.$i18n;
    if (i18n && typeof i18n.mergeLocaleMessage === 'function') {
      for (const [locale, messages] of Object.entries(SITE_RENAMES)) i18n.mergeLocaleMessage(locale, messages);
    }
    const rules = SITE_TITLE_RENAMES.map((rule) => {
      const renamed = Object.values(SITE_RENAMES).map((m) => messageAt(m, rule.key)).filter(Boolean)
        .map((name) => (rule.renamed ? rule.renamed(name) : name));
      const names = [rule.original, ...renamed].map(escapeRegExp).join('|');
      return { ...rule, regexp: new RegExp(rule.pattern(names)) };
    });
    const fixTitle = () => {
      const doc = pageWindow.document;
      if (typeof vm.$t !== 'function') return;
      let title = doc.title;
      for (const rule of rules) title = title.replace(rule.regexp, rule.to(vm.$t(rule.key)));
      // 观察器也会看到脚本自己的标题修改；相同值不得重复赋值，以免循环触发。
      if (title !== doc.title) doc.title = title;
    };
    syncNativeIcons();
    new MutationObserver(syncNativeIcons).observe(pageWindow.document.body, { childList: true, subtree: true, characterData: true });
    fixTitle();
    new MutationObserver(fixTitle).observe(pageWindow.document.head, { childList: true, subtree: true, characterData: true });
    if (i18n && typeof vm.$watch === 'function') vm.$watch(() => i18n.locale, fixTitle);
  },
};

export { siteRenameFeature };
