// ==UserScript==
// @name         asmr.one plus
// @namespace    asmr-one-plus
// @version      1.2.0
// @description  为 asmr.one 提供单人出演筛选、播放进度保存、播放历史、本地关注和数据管理，并补充界面与播放器操作提示。
// @match        https://asmr.one/*
// @match        https://www.asmr.one/*
// @match        https://asmr-100.com/*
// @match        https://www.asmr-100.com/*
// @match        https://asmr-200.com/*
// @match        https://www.asmr-200.com/*
// @match        https://asmr-300.com/*
// @match        https://www.asmr-300.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// @downloadURL  https://update.sleazyfork.org/scripts/603419/asmrone%20plus.user.js
// @updateURL    https://update.sleazyfork.org/scripts/603419/asmrone%20plus.meta.js
// ==/UserScript==

/*! 自动构建文件。维护入口：src/main.js；修改 src/ 后运行 npm run build，请勿直接修改本文件。 */
'use strict';
(() => {
  /*! 版本号由构建脚本从 package.json 注入；不要在源码中另写一份版本号。 */
  var SCRIPT_VERSION = "1.2.0";
  /*! 网站接入与通用 DOM 工具。当前依赖 Vue 2 的 #q-app.__vue__，网站升级框架时需先检查此处。 */
  var LOG_PREFIX = "[asmr.one plus]";
  var log = (...args) => console.log(LOG_PREFIX, ...args);
  var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  var SITE_API_KEYS = Object.freeze({
    "asmr.one": "original",
    "asmr-100.com": "mirror-100",
    "asmr-200.com": "mirror-200",
    "asmr-300.com": "mirror-300"
  });
  var siteHost = pageWindow.location.hostname.toLowerCase().replace(/^www\./, "");
  function waitForApp(timeoutMs = 15e3) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function poll() {
        const el2 = pageWindow.document.querySelector("#q-app");
        const vm = el2 && el2.__vue__;
        if (vm && vm.$store) return resolve(vm);
        if (Date.now() - started > timeoutMs) return reject(new Error("找不到 #q-app 的 Vue 实例"));
        setTimeout(poll, 200);
      })();
    });
  }
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  }
  function el(tag, attrs = {}, children = []) {
    const node = pageWindow.document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child != null) node.append(child);
    }
    return node;
  }
  function notify(vm, message) {
    if (vm.$q && typeof vm.$q.notify === "function") {
      vm.$q.notify({ message, position: "bottom-right", timeout: 2500 });
    } else {
      log(message);
    }
  }
  /*! 脚本界面文案与语言通知。文案值可为字符串或格式化函数，新增键时同步维护三种语言。 */
  var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  var MESSAGES = {
    "zh-CN": {
      justNow: "刚刚",
      minutesAgo: (n) => `${n} 分钟前`,
      hoursAgo: (n) => `${n} 小时前`,
      daysAgo: (n) => `${n} 天前`,
      subtitleMatchFailed: "字幕匹配失败，请在作品页重试",
      resumeFailed: "无法直接续播，已打开作品页",
      subtitleLoadFailed: "字幕加载失败，可重新选择字幕重试；旧编码字幕也可打开原生预览加载",
      listenedTo: (time) => `上次 ${time}`,
      history: "播放历史",
      trackLine: (playing, title) => `${playing ? "正在播放" : "上次听到"}：${title}`,
      nowPlaying: "正在播放",
      finished: "已听完",
      replay: "重新播放",
      resume: "继续播放",
      today: "今天",
      yesterday: "昨天",
      earlier: "更早",
      removeFromHistory: "从历史中删除",
      confirmRemoveHistory: "从播放历史中删除？续播进度会保留。",
      remove: "删除",
      workCount: (n) => `${n} 部作品`,
      confirmClearHistory: "清空全部播放历史？关注和播放进度会保留。",
      clearHistory: "清空历史",
      confirmClearProgress: "清除全部播放进度？关注和历史会保留。",
      clearProgress: "清除全部播放进度",
      clearTrackProgress: "清除这条音轨的播放进度",
      confirmClearTrackProgress: "清除这条音频的播放进度？同一音轨的其他格式会一起清除，关注和历史会保留。",
      resetCurrentNotice: "当前音轨将暂停并回到开头。",
      clearTrackProgressButton: "清除进度",
      dataManagement: "数据管理",
      clearProgressHint: "清除所有音频的播放进度，保留关注和历史。",
      clearAllHint: "清空关注、历史和播放进度。",
      close: "关闭",
      playerQueue: "查看播放队列",
      playerModeNames: { order: "顺序播放", "all repeat": "列表循环", "repeat once": "单曲循环", shuffle: "随机播放" },
      playerModeHint: (mode) => `播放模式：${mode}（点击切换）`,
      playerDesktopSubtitles: "切换为桌面字幕（画中画）",
      playerInlineSubtitles: "切换为页面内字幕",
      playerSelectSubtitles: "查看或选择字幕",
      playerLoadSubtitles: "加载本地字幕",
      playerMoreActions: "更多操作",
      historyEmpty: "还没有播放记录，播放任意作品后会出现在这里",
      following: "我的关注",
      typeLabel: { va: "声优", tag: "标签", circle: "社团" },
      soloWorksOnly: "仅单人出演",
      soloWorksLoading: "正在整理单人作品…",
      soloWorksLoadingPages: "正在计算总数和页码…",
      inbox: "默认分组",
      tab: (label, n) => `${label}（${n}）`,
      followHint: (type) => `悬停${type}，点右上角 ☆ 关注，或点“＋ 添加”`,
      loadingCounts: "正在更新作品数量…",
      refreshCounts: (time) => `刷新作品数量（每 5 分钟自动更新${time ? `，最近更新 ${time}` : ""}）。各分组按作品数量从多到少排列`,
      countError: "更新失败，保留上次数量；未匹配项显示未知，可重试",
      newGroupPrompt: "新分组的名字",
      groupNameInvalid: "分组名为空或已存在",
      newGroup: "＋ 新建分组",
      addTitle: "多个名字用分号分隔。",
      addPrompt: (group, type) => `添加到“${group}”：多个${type}用分号分隔。`,
      add: "＋ 添加",
      renamePrompt: "分组的新名字",
      rename: "改名",
      confirmDeleteGroup: (group, n, inbox) => `删除分组“${group}”？里面的${n}项会移到“${inbox}”。`,
      deleteGroup: "删除分组",
      clearGroup: "清空",
      confirmClearGroup: (group, n, type) => `取消关注“${group}”里的全部 ${n} 个${type}？此操作不能撤销，建议先导出备份。`,
      moveToGroup: "移到分组",
      unknown: "未知",
      works: (n) => `${n} 部`,
      follow: "关注",
      unfollow: "取消关注",
      followed: (on, name) => `${on ? "已关注" : "已取消关注"}：${name}`,
      starLabel: (on, name) => `${on ? "取消关注" : "关注"}：${name}`,
      followMenu: (on, type) => `${on ? "取消关注" : "关注"}${type}`,
      backupBadList: "备份列表格式或数量不正确",
      backupBadText: "备份文本字段不正确",
      backupBadNumber: "备份数值字段不正确",
      backupBadTrack: "音轨标识不正确",
      backupBadStructure: "备份数据结构不正确",
      backupBadWork: "历史作品标识不正确",
      backupBadSource: "作品来源标识不正确",
      backupTrackMismatch: "历史作品与音轨不匹配",
      backupBadProgress: "播放进度格式不正确",
      backupTooManyProgress: "进度记录过多",
      backupBadFollow: "关注项格式不正确",
      backupInvalidFile: "备份文件过大或格式不正确",
      backupNotJson: "文件不是有效的 JSON 备份",
      backupUnsupported: "不是受支持的脚本数据备份",
      storageFailed: "存储写入失败；请保留导出的备份并检查脚本管理器存储",
      importRolledBack: "导入未完成，已恢复原数据",
      exportSkipped: (n) => `已导出备份；有 ${n} 条无法识别的本地记录未包含在内`,
      exportFailed: "备份导出失败，请检查本地数据和下载权限",
      backupTooLarge: "备份文件不能超过 10 MB",
      importConfirm: (follows, works, tracks, skipped) => `备份包含 ${follows} 个关注、${works} 部历史作品、${tracks} 条音轨进度。

导入会合并数据，不删除现有关注；相同关注保留本地分组，播放记录取更新时间较新的。建议先导出当前数据。${skipped ? `

注意：本地有 ${skipped} 条无法识别的记录，合并后不会保留。` : ""}

确定导入？`,
      importDone: "备份已导入并合并",
      importFailed: "备份导入失败",
      backup: "备份与导入",
      exportBackup: "导出全部数据",
      importBackup: "导入全部数据",
      backupHint: "导出或导入关注、历史和播放进度。",
      playlistRemoveHint: "移出这个收藏夹（作品本身不受影响）",
      playlistRemoveTitle: "移出收藏夹",
      playlistRemoveConfirm: (code) => code ? `把 ${code} 移出这个收藏夹？` : "把这部作品移出这个收藏夹？",
      playlistRemoveOk: "移出",
      cancel: "取消",
      clearAllMenu: "清除全部数据",
      clearAllConfirm: "清空关注、历史和播放进度？此操作不能撤销。"
    },
    ja: {
      justNow: "たった今",
      minutesAgo: (n) => `${n} 分前`,
      hoursAgo: (n) => `${n} 時間前`,
      daysAgo: (n) => `${n} 日前`,
      subtitleMatchFailed: "字幕を割り当てられませんでした。作品ページで再試行してください",
      resumeFailed: "ここから再開できないため、作品ページを開きました",
      subtitleLoadFailed: "字幕を読み込めませんでした。字幕を選び直すと再試行します。古い文字コードの字幕はプレビューからも読み込めます",
      listenedTo: (time) => `前回 ${time}`,
      history: "再生履歴",
      trackLine: (playing, title) => `${playing ? "再生中" : "前回の位置"}：${title}`,
      nowPlaying: "再生中",
      finished: "再生済み",
      replay: "最初から再生",
      resume: "続きから再生",
      today: "今日",
      yesterday: "昨日",
      earlier: "それ以前",
      removeFromHistory: "履歴から削除",
      confirmRemoveHistory: "再生履歴から削除しますか？再開位置は残ります。",
      remove: "削除",
      workCount: (n) => `${n} 作品`,
      confirmClearHistory: "すべての再生履歴を消去しますか？フォローと再開位置は残ります。",
      clearHistory: "履歴を消去",
      confirmClearProgress: "すべての再開位置を消去しますか？フォローと履歴は残ります。",
      clearProgress: "すべての再開位置を消去",
      clearTrackProgress: "このトラックの再開位置を消去",
      confirmClearTrackProgress: "このトラックの再開位置を消去しますか？同じトラックの別形式も対象です。フォローと履歴は残ります。",
      resetCurrentNotice: "現在のトラックを一時停止し、先頭に戻します。",
      clearTrackProgressButton: "再開位置を消去",
      dataManagement: "データ管理",
      clearProgressHint: "全トラックの再開位置を消去。フォローと履歴は残ります。",
      clearAllHint: "フォロー、履歴、再開位置をすべて削除。",
      close: "閉じる",
      playerQueue: "再生キューを表示",
      playerModeNames: { order: "順番再生", "all repeat": "全曲リピート", "repeat once": "1曲リピート", shuffle: "シャッフル" },
      playerModeHint: (mode) => `再生モード：${mode}（クリックで切替）`,
      playerDesktopSubtitles: "デスクトップ字幕に切替（ピクチャーインピクチャー）",
      playerInlineSubtitles: "ページ内字幕に切替",
      playerSelectSubtitles: "字幕を表示・選択",
      playerLoadSubtitles: "ローカル字幕を読み込む",
      playerMoreActions: "その他の操作",
      historyEmpty: "まだ再生履歴がありません。作品を再生するとここに表示されます",
      following: "フォロー中",
      typeLabel: { va: "声優", tag: "タグ", circle: "サークル" },
      soloWorksOnly: "単独出演のみ",
      soloWorksLoading: "単独出演作品を読み込み中…",
      soloWorksLoadingPages: "作品数とページ数を集計中…",
      inbox: "デフォルト",
      tab: (label, n) => `${label}（${n}）`,
      followHint: (type) => `${type}にカーソルを合わせて右上の ☆、または「＋ 追加」でフォロー`,
      loadingCounts: "作品数を更新中…",
      refreshCounts: (time) => `作品数を更新（5 分ごとに自動更新${time ? `、最終更新 ${time}` : ""}）。各グループは作品数の多い順に並びます`,
      countError: "更新できませんでした。前回の作品数を表示しています（不明の項目は再試行できます）",
      newGroupPrompt: "新しいグループの名前",
      groupNameInvalid: "グループ名が空か、すでに存在します",
      newGroup: "＋ 新しいグループ",
      addTitle: "セミコロンで区切ってください",
      addPrompt: (group, type) => `「${group}」に追加：${type}の名前を入力（セミコロンで区切る）`,
      add: "＋ 追加",
      renamePrompt: "グループの新しい名前",
      rename: "名前を変更",
      confirmDeleteGroup: (group, n, inbox) => `グループ「${group}」を削除しますか？中の ${n} 件は「${inbox}」に移ります。`,
      deleteGroup: "グループを削除",
      clearGroup: "空にする",
      confirmClearGroup: (group, n, type) => `「${group}」の${type} ${n} 件をすべてフォロー解除しますか？元に戻せないため、先にバックアップを書き出すことをおすすめします。`,
      moveToGroup: "グループを移動",
      unknown: "不明",
      works: (n) => `${n} 作品`,
      follow: "フォロー",
      unfollow: "フォロー解除",
      followed: (on, name) => `${on ? "フォローしました" : "フォローを解除しました"}：${name}`,
      starLabel: (on, name) => `${on ? "フォロー解除" : "フォロー"}：${name}`,
      followMenu: (on, type) => `${type}を${on ? "フォロー解除" : "フォロー"}`,
      backupBadList: "バックアップのリストの形式か件数が正しくありません",
      backupBadText: "バックアップの文字列の項目が正しくありません",
      backupBadNumber: "バックアップの数値の項目が正しくありません",
      backupBadTrack: "トラック ID が正しくありません",
      backupBadStructure: "バックアップのデータ構造が正しくありません",
      backupBadWork: "履歴の作品 ID が正しくありません",
      backupBadSource: "作品番号が正しくありません",
      backupTrackMismatch: "履歴の作品とトラックが一致しません",
      backupBadProgress: "再生位置の形式が正しくありません",
      backupTooManyProgress: "再生位置の記録が多すぎます",
      backupBadFollow: "フォロー項目の形式が正しくありません",
      backupInvalidFile: "バックアップファイルが大きすぎるか、形式が正しくありません",
      backupNotJson: "有効な JSON バックアップではありません",
      backupUnsupported: "このスクリプトのバックアップではありません",
      storageFailed: "保存に失敗しました。書き出したバックアップを残し、スクリプトマネージャーの保存領域を確認してください",
      importRolledBack: "読み込みを完了できなかったため、元のデータに戻しました",
      exportSkipped: (n) => `バックアップを書き出しました。認識できないローカル記録 ${n} 件は含まれていません`,
      exportFailed: "バックアップを書き出せませんでした。ローカルデータとダウンロードの許可を確認してください",
      backupTooLarge: "バックアップファイルは 10 MB 以下にしてください",
      importConfirm: (follows, works, tracks, skipped) => `バックアップにはフォロー ${follows} 件、履歴 ${works} 作品、トラックの再生位置 ${tracks} 件が含まれます。

読み込むとデータを統合します。今のフォローは削除されず、同じフォローはローカルのグループのまま、再生記録は新しいほうを残します。先に今のデータを書き出しておくことをおすすめします。${skipped ? `

注意：認識できないローカル記録が ${skipped} 件あり、統合後は残りません。` : ""}

読み込みますか？`,
      importDone: "バックアップを読み込んで統合しました",
      importFailed: "バックアップを読み込めませんでした",
      backup: "バックアップと復元",
      exportBackup: "すべてのデータを書き出す",
      importBackup: "すべてのデータを読み込む",
      backupHint: "フォロー、履歴、再開位置の書き出し・読み込み。",
      playlistRemoveHint: "このコレクションから外す（作品自体は削除されません）",
      playlistRemoveTitle: "コレクションから外す",
      playlistRemoveConfirm: (code) => code ? `${code} をこのコレクションから外しますか？` : "この作品をこのコレクションから外しますか？",
      playlistRemoveOk: "外す",
      cancel: "キャンセル",
      clearAllMenu: "全データを消去",
      clearAllConfirm: "フォロー、履歴、再開位置をすべて削除しますか？元に戻せません。"
    },
    en: {
      justNow: "just now",
      minutesAgo: (n) => `${plural(n, "minute", "minutes")} ago`,
      hoursAgo: (n) => `${plural(n, "hour", "hours")} ago`,
      daysAgo: (n) => `${plural(n, "day", "days")} ago`,
      subtitleMatchFailed: "Couldn’t match subtitles. Try again on the work page.",
      resumeFailed: "Couldn’t resume here, so the work page was opened.",
      subtitleLoadFailed: "Couldn’t load the subtitles. Pick them again to retry; subtitles in older encodings can also be loaded from the preview.",
      listenedTo: (time) => `Last at ${time}`,
      history: "History",
      trackLine: (playing, title) => `${playing ? "Now playing" : "Last played"}: ${title}`,
      nowPlaying: "Now playing",
      finished: "Finished",
      replay: "Play again",
      resume: "Continue",
      today: "Today",
      yesterday: "Yesterday",
      earlier: "Earlier",
      removeFromHistory: "Remove from history",
      confirmRemoveHistory: "Remove from history? The resume position will be kept.",
      remove: "Remove",
      workCount: (n) => plural(n, "work", "works"),
      confirmClearHistory: "Clear all play history? Follows and playback progress will be kept.",
      clearHistory: "Clear history",
      confirmClearProgress: "Clear all saved playback positions? Follows and history will be kept.",
      clearProgress: "Clear playback progress",
      clearTrackProgress: "Clear this track’s playback position",
      confirmClearTrackProgress: "Clear this track’s playback position, including other formats of the same track? Follows and history will be kept.",
      resetCurrentNotice: "The current track will be paused and returned to the beginning.",
      clearTrackProgressButton: "Clear progress",
      dataManagement: "Data management",
      clearProgressHint: "Clear all resume positions. Keep follows and history.",
      clearAllHint: "Delete all follows, history and playback progress.",
      close: "Close",
      playerQueue: "Show playback queue",
      playerModeNames: { order: "In order", "all repeat": "Repeat all", "repeat once": "Repeat one", shuffle: "Shuffle" },
      playerModeHint: (mode) => `Playback mode: ${mode} (click to change)`,
      playerDesktopSubtitles: "Switch to desktop subtitles (picture-in-picture)",
      playerInlineSubtitles: "Switch to in-page subtitles",
      playerSelectSubtitles: "View or select subtitles",
      playerLoadSubtitles: "Load local subtitles",
      playerMoreActions: "More actions",
      historyEmpty: "Nothing here yet. Works you play will show up here.",
      following: "Following",
      typeLabel: { va: "Voice actors", tag: "Tags", circle: "Circles" },
      typeNoun: { va: "voice actor", tag: "tag", circle: "circle" },
      soloWorksOnly: "Solo performances only",
      soloWorksLoading: "Loading solo works…",
      soloWorksLoadingPages: "Calculating totals and page numbers…",
      inbox: "Default",
      tab: (label, n) => `${label} (${n})`,
      followHint: (type) => `Hover over a ${type} and click the ☆ in its corner, or use “+ Add”`,
      loadingCounts: "Updating counts…",
      refreshCounts: (time) => `Refresh work counts (updates every 5 minutes${time ? `; last updated ${time}` : ""}). Each group is sorted by number of works.`,
      countError: "Update failed. Showing the last counts; unmatched items show as unknown. You can retry.",
      newGroupPrompt: "Name of the new group",
      groupNameInvalid: "The group name is empty or already exists",
      newGroup: "+ New group",
      addTitle: "Separate names with semicolons only",
      addPrompt: (group, type) => `Add to “${group}”: enter ${type} names, separated only by semicolons`,
      add: "+ Add",
      renamePrompt: "New name for the group",
      rename: "Rename",
      confirmDeleteGroup: (group, n, inbox) => `Delete the group “${group}”? ${n === 1 ? "Its 1 item" : `Its ${n} items`} will move to “${inbox}”.`,
      deleteGroup: "Delete group",
      clearGroup: "Clear",
      confirmClearGroup: (group, n, type) => `Unfollow all ${n} ${type}${n === 1 ? "" : "s"} in “${group}”? This cannot be undone, so consider exporting a backup first.`,
      moveToGroup: "Move to group",
      unknown: "Unknown",
      works: (n) => plural(n, "work", "works"),
      follow: "Follow",
      unfollow: "Unfollow",
      followed: (on, name) => `${on ? "Followed" : "Unfollowed"}: ${name}`,
      starLabel: (on, name) => `${on ? "Unfollow" : "Follow"} ${name}`,
      followMenu: (on, type) => `${on ? "Unfollow" : "Follow"} ${type}`,
      backupBadList: "A list in the backup has the wrong format or size",
      backupBadText: "A text field in the backup is invalid",
      backupBadNumber: "A number field in the backup is invalid",
      backupBadTrack: "A track ID is invalid",
      backupBadStructure: "The backup’s data structure is invalid",
      backupBadWork: "A work ID in the history is invalid",
      backupBadSource: "A work code is invalid",
      backupTrackMismatch: "A history entry doesn’t match its track",
      backupBadProgress: "A resume position is invalid",
      backupTooManyProgress: "Too many resume positions",
      backupBadFollow: "A followed item is invalid",
      backupInvalidFile: "The backup file is too large or invalid",
      backupNotJson: "This file is not a valid JSON backup",
      backupUnsupported: "This is not a supported backup of this script",
      storageFailed: "Couldn’t write to storage. Keep your exported backup and check the script manager’s storage.",
      importRolledBack: "The import didn’t finish; your original data was restored",
      exportSkipped: (n) => `Backup exported. ${plural(n, "unreadable local record was", "unreadable local records were")} left out.`,
      exportFailed: "Couldn’t export the backup. Check your local data and download permissions.",
      backupTooLarge: "The backup file must be 10 MB or smaller",
      importConfirm: (follows, works, tracks, skipped) => `The backup has ${plural(follows, "follow", "follows")}, ${plural(works, "work", "works")} in history and ${plural(tracks, "track position", "track positions")}.

Importing merges the data and doesn’t remove any current follows. Follows you already have keep their local group, and the newer play record wins. Consider exporting your current data first.${skipped ? `

Note: ${plural(skipped, "unreadable local record", "unreadable local records")} won’t be kept after merging.` : ""}

Import now?`,
      importDone: "Backup imported and merged",
      importFailed: "Couldn’t import the backup",
      backup: "Backup & import",
      exportBackup: "Export all data",
      importBackup: "Import all data",
      backupHint: "Export or import follows, history and playback progress.",
      playlistRemoveHint: "Remove from this collection (the work itself is not deleted)",
      playlistRemoveTitle: "Remove from collection",
      playlistRemoveConfirm: (code) => code ? `Remove ${code} from this collection?` : "Remove this work from this collection?",
      playlistRemoveOk: "Remove",
      cancel: "Cancel",
      clearAllMenu: "Clear all data",
      clearAllConfirm: "Delete all follows, history and playback progress? This can’t be undone."
    }
  };
  var LOCALE_INFO = {
    "zh-CN": { tag: "zh-CN", api: ["zh-cn", "zh-CN", "zh"] },
    ja: { tag: "ja-JP", api: ["ja-jp", "ja"] },
    en: { tag: "en-US", api: ["en-us", "en"] }
  };
  var localeVm = null;
  var localeListeners = new Set();
  function currentLocale() {
    const locale = String(localeVm && localeVm.$i18n && localeVm.$i18n.locale || "").toLowerCase();
    if (!locale || locale.startsWith("zh")) return "zh-CN";
    return locale.startsWith("ja") ? "ja" : "en";
  }
  function tr(key, ...args) {
    const value = MESSAGES[currentLocale()][key] ?? MESSAGES["zh-CN"][key];
    return typeof value === "function" ? value(...args) : value;
  }
  var typeLabel = (type) => tr("typeLabel")[type];
  var typeNoun = (type) => (tr("typeNoun") || tr("typeLabel"))[type];
  function watchLocale(vm) {
    localeVm = vm;
    if (!vm.$i18n || typeof vm.$watch !== "function") return;
    vm.$watch(() => vm.$i18n.locale, () => {
      for (const fn of localeListeners) {
        try {
          fn();
        } catch (err) {
          console.error(LOG_PREFIX, err);
        }
      }
    });
  }
  function onLocaleChange(fn) {
    localeListeners.add(fn);
    return () => localeListeners.delete(fn);
  }
  function localizedEntityName(entry, fallback) {
    const i18n = entry && entry.i18n;
    for (const key of LOCALE_INFO[currentLocale()].api) {
      const name = i18n && i18n[key] && i18n[key].name;
      if (name) return name;
    }
    return entry && entry.name || fallback;
  }
  function formatAgo(timestamp, now = Date.now()) {
    const diff = Math.max(0, now - timestamp) / 1e3;
    if (diff < 60) return tr("justNow");
    if (diff < 3600) return tr("minutesAgo", Math.floor(diff / 60));
    if (diff < 86400) return tr("hoursAgo", Math.floor(diff / 3600));
    if (diff < 86400 * 30) return tr("daysAgo", Math.floor(diff / 86400));
    return new Date(timestamp).toLocaleDateString(LOCALE_INFO[currentLocale()].tag);
  }
  /*! 持久化统一入口：aop: 前缀下的 GM 存储独立于网站账号，同一已安装脚本可跨匹配域名读取。 */
  var storage = {
    get(key, fallback) {
      return GM_getValue(`aop:${key}`, fallback);
    },
    set(key, value) {
      GM_setValue(`aop:${key}`, value);
    },
    remove(key) {
      GM_deleteValue(`aop:${key}`);
    }
  };
  /*! 本地关注与分组仓库。关注标识优先用网站 ID，别名用于识别手动输入或不同语言下的同一实体。 */
  var FAVORITES_KEY = "favorites";
  var FAVORITE_TYPES = {
    va: { keyword: "va", groups: ["默认分组"], inbox: "默认分组" },
    tag: { keyword: "tag", groups: ["默认分组"], inbox: "默认分组" },
    circle: { keyword: "circle", groups: ["默认分组"], inbox: "默认分组" }
  };
  var INBOX_NAMES = new Set(Object.values(MESSAGES).map((messages) => messages.inbox));
  function groupName(type, group) {
    return group === FAVORITE_TYPES[type].inbox ? tr("inbox") : group;
  }
  function favoriteNames(item) {
    return [...new Set([item.name, ...item.aliases || []].filter(Boolean))];
  }
  function sameFavorite(item, target) {
    if (typeof target !== "object" || target == null) return String(item.id) === String(target) || favoriteNames(item).includes(String(target));
    if (item.siteId != null && target.siteId != null) return String(item.siteId) === String(target.siteId);
    return String(item.id) === String(target.id) || favoriteNames(item).some((name) => favoriteNames(target).includes(name));
  }
  var favoritesStore = {
    listeners: new Set(),
    version: 0,
    all() {
      const data = storage.get(FAVORITES_KEY, {});
      let migrated = false;
      data.groups = data.groups || {};
      for (const [type, { groups, inbox }] of Object.entries(FAVORITE_TYPES)) {
        data[type] = data[type] || [];
        data.groups[type] = data.groups[type] || [...groups];
        if (data.groups[type].includes("未分组")) {
          data.groups[type] = [...new Set(data.groups[type].map((name) => name === "未分组" ? inbox : name))];
          for (const item of data[type]) if (item.group === "未分组") item.group = inbox;
          migrated = true;
        }
        if (!data.groups[type].includes(inbox)) data.groups[type].push(inbox);
        for (const item of data[type]) if (!data.groups[type].includes(item.group)) item.group = inbox;
      }
      if (migrated) storage.set(FAVORITES_KEY, data);
      return data;
    },
    groups(type) {
      return this.all().groups[type];
    },
    list(type) {
      return this.all()[type];
    },
    find(type, target) {
      return this.list(type).find((item) => sameFavorite(item, target));
    },
    has(type, target) {
      return !!this.find(type, target);
    },
    // 将旧的纯名称关注补全为网站实体，同时保留原分组和所有已知别名。
    reconcile(type, item) {
      const data = this.all();
      const matches = data[type].filter((entry) => sameFavorite(entry, item));
      if (!matches.length) return null;
      const first = matches[0];
      const siteId = item.siteId != null ? item.siteId : first.siteId;
      const merged = { ...first, ...siteId != null ? { siteId } : {}, aliases: [...new Set([...matches, item].flatMap(favoriteNames))].sort() };
      const next = data[type].filter((entry) => !matches.includes(entry) || entry === first).map((entry) => entry === first ? merged : entry);
      if (JSON.stringify(next) !== JSON.stringify(data[type])) {
        data[type] = next;
        this.save(data);
      }
      return merged;
    },
    add(type, item, { append = false } = {}) {
      if (this.has(type, item)) {
        this.reconcile(type, item);
        return;
      }
      const data = this.all();
      const group = data.groups[type].includes(item.group) ? item.group : FAVORITE_TYPES[type].inbox;
      data[type][append ? "push" : "unshift"]({ ...item, group, addedAt: Date.now() });
      this.save(data);
    },
    move(type, id, group, beforeId) {
      const data = this.all();
      const list = data[type];
      const index = list.findIndex((item2) => sameFavorite(item2, id));
      if (index < 0 || !data.groups[type].includes(group)) return;
      const [item] = list.splice(index, 1);
      item.group = group;
      const before = beforeId == null ? -1 : list.findIndex((x) => sameFavorite(x, beforeId));
      if (before >= 0) list.splice(before, 0, item);
      else list.push(item);
      this.save(data);
    },
    addGroup(type, name) {
      const data = this.all();
      name = name.trim();
      if (!name || data.groups[type].includes(name) || INBOX_NAMES.has(name)) return false;
      const groups = data.groups[type];
      const inboxAt = groups.indexOf(FAVORITE_TYPES[type].inbox);
      groups.splice(inboxAt < 0 ? groups.length : inboxAt, 0, name);
      this.save(data);
      return true;
    },
    renameGroup(type, from, to) {
      const data = this.all();
      to = to.trim();
      const groups = data.groups[type];
      if (!to || groups.includes(to) || INBOX_NAMES.has(to) || !groups.includes(from) || from === FAVORITE_TYPES[type].inbox) return false;
      groups[groups.indexOf(from)] = to;
      for (const item of data[type]) if (item.group === from) item.group = to;
      this.save(data);
      return true;
    },
    removeGroup(type, name) {
      const data = this.all();
      if (name === FAVORITE_TYPES[type].inbox) return;
      data.groups[type] = data.groups[type].filter((g) => g !== name);
      for (const item of data[type]) if (item.group === name) item.group = FAVORITE_TYPES[type].inbox;
      this.save(data);
    },
    clearGroup(type, group) {
      const data = this.all();
      data[type] = data[type].filter((item) => item.group !== group);
      this.save(data);
    },
    remove(type, id) {
      const data = this.all();
      data[type] = data[type].filter((item) => !sameFavorite(item, id));
      this.save(data);
    },
    toggle(type, item) {
      const existing = this.find(type, item);
      if (existing) this.remove(type, existing.id);
      else this.add(type, item);
      return this.has(type, item);
    },
    clear() {
      storage.remove(FAVORITES_KEY);
      storage.remove("favorites-tab");
      storage.remove("favorites-sort");
      storage.remove("directory-sort");
      this.version++;
      for (const fn of this.listeners) fn();
    },
    save(data) {
      storage.set(FAVORITES_KEY, data);
      this.version++;
      for (const fn of this.listeners) fn();
    },
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
  };
  function keywordRoute(type, name) {
    return { path: "/works", query: { keyword: `$${FAVORITE_TYPES[type].keyword}:${name}$` } };
  }
  /*! 历史按作品 workId 去重，保存该作品最后播放音轨的快照，最多保留 200 部作品；清除历史不删除进度。 */
  var HISTORY_KEY = "history";
  var HISTORY_LIMIT = 200;
  var historyStore = {
    deleteListeners: new Set(),
    all() {
      return storage.get(HISTORY_KEY, []);
    },
    touch(entry) {
      const list = this.all().filter((item) => item.workId !== entry.workId);
      list.unshift({ ...entry, updatedAt: Date.now() });
      storage.set(HISTORY_KEY, list.slice(0, HISTORY_LIMIT));
    },
    remove(workId) {
      storage.set(HISTORY_KEY, this.all().filter((item) => item.workId !== workId));
      for (const fn of this.deleteListeners) fn(workId);
    },
    clear() {
      storage.remove(HISTORY_KEY);
      for (const fn of this.deleteListeners) fn(null);
    },
    onDelete(fn) {
      this.deleteListeners.add(fn);
      return () => this.deleteListeners.delete(fn);
    }
  };
  /*! API 接入：优先采用网站配置，回退到当前域名的接口；目录、封面和历史续播共用此规则。 */
  var API_URLS = {
    latest: "https://api.asmr-200.com",
    original: "https://api.asmr.one",
    "mirror-100": "https://api.asmr-100.com",
    "mirror-200": "https://api.asmr-200.com",
    "mirror-300": "https://api.asmr-300.com"
  };
  var DEFAULT_API_BASE = API_URLS[SITE_API_KEYS[siteHost]];
  /*! 此处的已知地址校验同时限制 JWT 的发送目标，不能直接信任任意 baseURL。 */
  function getApiBase(vm) {
    const baseURL = vm.$axios && vm.$axios.defaults && vm.$axios.defaults.baseURL;
    if (typeof baseURL === "string" && Object.values(API_URLS).includes(baseURL.replace(/\/+$/, ""))) return baseURL.replace(/\/+$/, "");
    const ls = vm.$q && vm.$q.localStorage;
    const key = ls && ls.getItem("apiUrlKey");
    return Object.hasOwn(API_URLS, key) ? API_URLS[key] : DEFAULT_API_BASE;
  }
  async function apiGet(vm, path, { fresh = false } = {}) {
    const ls = vm.$q && vm.$q.localStorage;
    const token = ls && ls.getItem("jwt-token");
    const res = await fetch(`${getApiBase(vm)}/api/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: "error",
      referrerPolicy: "no-referrer",
      ...fresh ? { cache: "no-store" } : {}
    });
    if (!res.ok) throw new Error(`API ${path} 返回 ${res.status}`);
    return res.json();
  }
  /*! 播放进度仓库：按音轨 hash 保存 {t: 秒, d: 总时长秒, title, updatedAt: 毫秒}，不负责删除历史。 */
  var PROGRESS_KEY = "progress";
  var SAVE_INTERVAL_MS = 5e3;
  var END_MARGIN_SECONDS = 10;
  var titleKey = (title) => String(title || "").replace(/\.[^./\\]+$/, "").normalize("NFKC").trim().toLowerCase();
  var closeDuration = (a, b) => !a || !b || Math.abs(a - b) <= Math.max(1, Math.min(a, b) * 0.01);
  /*! 不同音频格式可能有不同 hash。同一作品内用去扩展名的标题和接近的时长识别同一音轨。
   * 旧记录没有标题时，仅接受唯一的时长匹配，避免把其他音轨的进度接过来。
   */
  function progressSiblings(all, track) {
    const workId = String(track.hash).split("/")[0];
    const base = titleKey(track.title);
    const candidates = Object.entries(all).filter(([hash]) => hash !== track.hash && hash.split("/")[0] === workId);
    const byRecent = (entries) => entries.sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(([hash]) => hash);
    const named = candidates.filter(([, entry]) => entry.title && base && titleKey(entry.title) === base && closeDuration(entry.d, track.duration));
    if (named.length) return byRecent(named);
    const legacy = candidates.filter(([, entry]) => !entry.title && track.duration > 0 && entry.d > 0 && Math.abs(entry.d - track.duration) <= 1);
    return legacy.length === 1 ? byRecent(legacy) : [];
  }
  var progressStore = {
    listeners: new Set(),
    clearListeners: new Set(),
    all() {
      return storage.get(PROGRESS_KEY, {});
    },
    get(hash) {
      return this.all()[hash];
    },
    find(track) {
      const all = this.all();
      if (all[track.hash]) return all[track.hash];
      const [sibling] = progressSiblings(all, track);
      return sibling ? all[sibling] : void 0;
    },
    save(hash, t, d, title) {
      const all = this.all();
      for (const sibling of progressSiblings(all, { hash, title, duration: d })) delete all[sibling];
      all[hash] = { t, d, ...title ? { title } : {}, updatedAt: Date.now() };
      storage.set(PROGRESS_KEY, all);
      this.changed();
    },
    clear(hash, title, d) {
      const all = this.all();
      const keys = [hash, ...progressSiblings(all, { hash, title, duration: d })].filter((key) => key in all);
      if (!keys.length) return false;
      for (const key of keys) delete all[key];
      storage.set(PROGRESS_KEY, all);
      this.changed();
      return true;
    },
    clearAll() {
      storage.remove(PROGRESS_KEY);
      for (const fn of this.clearListeners) fn();
      this.changed();
    },
    onClear(fn) {
      this.clearListeners.add(fn);
      return () => this.clearListeners.delete(fn);
    },
    version: 0,
    changed() {
      this.version++;
      for (const fn of this.listeners) fn();
    },
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
  };
  function isFinished(t, d) {
    return d > 0 && t >= d - Math.min(END_MARGIN_SECONDS, d * 0.05);
  }
  /*! 网站播放器状态适配：队列读取、作品标识和目录展开集中在这里。 */
  function currentTrack(state) {
    const player = state.AudioPlayer;
    if (!player || !Array.isArray(player.queue)) return null;
    const track = player.queue[player.queueIndex];
    return track && track.hash ? track : null;
  }
  function trackWorkInfo(track) {
    const work = track.work || {};
    const workId = Number(work.id || String(track.hash).split("/")[0]);
    const sourceId = work.source_id || `RJ${String(workId).padStart(workId >= 1e6 ? 8 : 6, "0")}`;
    return { workId, sourceId, workTitle: track.workTitle || sourceId };
  }
  function playbackFiles(tree, audio = [], lyrics = []) {
    for (const node of tree || []) {
      if (node.type === "folder") playbackFiles(node.children, audio, lyrics);
      else if (node.type === "audio") audio.push({ ...node, availableLyrics: [], selectedLyricIndex: -1 });
      else if (node.type === "text" && /\.(lrc|vtt|srt|ass)$/i.test(node.title || "")) {
        lyrics.push({ ...node, content: typeof node.content === "string" ? node.content : "" });
      }
    }
    return { audio, lyrics };
  }
  /*! 异步续播请求的失效标记：切歌、清除或新的续播请求会递增，旧请求返回后不得覆盖新队列。 */
  var resumeState = { requestId: 0 };
  /*! 从历史恢复作品队列；真正的进度跳转由 progress 模块在收到时长后执行。 */
  async function resumeFromHistory(vm, entry) {
    const requestId = ++resumeState.requestId;
    try {
      const { audio, lyrics } = playbackFiles(await apiGet(vm, `tracks/${entry.workId}?v=2`));
      if (requestId !== resumeState.requestId) return;
      const index = audio.findIndex((track) => track.hash === entry.trackHash);
      if (index < 0) throw new Error("作品里找不到这条音轨");
      if (lyrics.length && !vm.$store._actions?.["AudioPlayer/pushMultiLyricToQueue"]) {
        throw new Error("网站的字幕匹配接口不可用");
      }
      if (vm.$store._mutations && vm.$store._mutations["AudioPlayer/LOAD_PLAYER"]) vm.$store.commit("AudioPlayer/LOAD_PLAYER");
      vm.$store.commit("AudioPlayer/SET_QUEUE", { queue: audio, index, resetPlaying: true });
      if (lyrics.length) {
        try {
          await vm.$store.dispatch("AudioPlayer/pushMultiLyricToQueue", { lyrics });
        } catch (err) {
          console.error(LOG_PREFIX, err);
          if (vm.$store.state.AudioPlayer.queue === audio) notify(vm, tr("subtitleMatchFailed"));
        }
      }
    } catch (err) {
      if (requestId !== resumeState.requestId) return;
      console.error(LOG_PREFIX, err);
      notify(vm, tr("resumeFailed"));
      vm.$router.push(`/work/${entry.sourceId}`).catch(() => {
      });
    }
  }
  /*! 网站导航适配：复用原站侧栏样式，在现有 layout 下注册脚本页面，避免丢失播放器和导航框架。 */
  function addNavItem({ id, label, iconSvg, href = null, onClick, isActive = () => false, onInsert = () => {
  }, after = "/playlists" }) {
    const doc = pageWindow.document;
    const selectors = [].concat(after).map((a) => a.startsWith("/") ? `a[href$="${a}"]` : a);
    const build = (template) => {
      const item = doc.createElement(href ? "a" : "button");
      for (const { name, value } of template.attributes) {
        if (!["href", "role", "tabindex", "type", "id", "aria-current", "aria-disabled"].includes(name)) item.setAttribute(name, value);
      }
      for (const child of template.childNodes) item.append(child.cloneNode(true));
      item.setAttribute("data-aop-nav", id);
      if (href) item.setAttribute("href", href);
      else {
        item.setAttribute("type", "button");
        Object.assign(item.style, { border: "0", width: "100%", background: "transparent", color: "inherit", textAlign: "inherit" });
      }
      for (const child of item.querySelectorAll("[tabindex]")) child.removeAttribute("tabindex");
      item.style.cursor = "pointer";
      for (const node of [item, ...item.querySelectorAll("*")]) {
        for (const cls of [...node.classList]) if (/active/.test(cls)) node.classList.remove(cls);
      }
      for (const cls of activeClasses) item.classList.remove(cls);
      const icon = item.querySelector(".q-icon");
      if (icon) {
        icon.removeAttribute("data-aop-native-icon");
        icon.innerHTML = iconSvg;
      }
      setLabel(item);
      item.addEventListener("click", (event) => {
        if (href && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }, true);
      item.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) event.stopPropagation();
      }, true);
      return item;
    };
    const setLabel = (item) => {
      const icon = item.querySelector(".q-icon");
      const name = label();
      if (item.title !== name) item.title = name;
      if (item.getAttribute("aria-label") !== name) item.setAttribute("aria-label", name);
      const walker = doc.createTreeWalker(item, 4);
      let replaced = false;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.nodeValue.trim() || icon && icon.contains(text)) continue;
        const value = replaced ? "" : name;
        if (text.nodeValue !== value) text.nodeValue = value;
        replaced = true;
      }
    };
    const FALLBACK_ACTIVE = ["q-router-link--active", "q-router-link--exact-active", "text-deep-purple", "text-weight-medium"];
    const isLinkActive = (a) => [...a.classList].some((cls) => /^q-router-link--(exact-)?active$/.test(cls));
    let activeClasses = new Set(FALLBACK_ACTIVE);
    let learned = false;
    const learnActiveClasses = () => {
      if (learned) return;
      const links = [...doc.querySelectorAll("a.q-item")].filter((a) => !a.hasAttribute("data-aop-nav"));
      const active = links.find(isLinkActive);
      const inactive = links.find((a) => !isLinkActive(a));
      if (!active || !inactive) return;
      activeClasses = new Set([...active.classList].filter((cls) => !inactive.classList.contains(cls)));
      learned = true;
    };
    const syncActive = (item) => {
      learnActiveClasses();
      const active = isActive();
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
      for (const cls of FALLBACK_ACTIVE) if (!activeClasses.has(cls)) item.classList.remove(cls);
      for (const cls of activeClasses) item.classList.toggle(cls, active);
    };
    const ensure = () => {
      const existing = doc.querySelector(`[data-aop-nav="${id}"]`);
      if (existing) {
        syncActive(existing);
        setLabel(existing);
        return true;
      }
      const anchor = selectors.map((sel) => doc.querySelector(sel)).find(Boolean);
      if (!anchor) return false;
      const template = anchor.closest(".q-item") || anchor;
      const item = build(template);
      syncActive(item);
      template.after(item);
      onInsert(item);
      return true;
    };
    const found = ensure();
    onLocaleChange(ensure);
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      pageWindow.requestAnimationFrame(() => {
        scheduled = false;
        ensure();
      });
    }).observe(doc.body, { childList: true, subtree: true });
    return found;
  }
  var ICONS = {
    data: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 10v4c0 2.21 3.58 4 8 4s8-1.79 8-4v-4c-1.72 1.4-4.65 2-8 2s-6.28-.6-8-2zm0 7v2c0 2.21 3.58 4 8 4s8-1.79 8-4v-2c-1.72 1.4-4.65 2-8 2s-6.28-.6-8-2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
    history: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>'
  };
  function addPage(vm, { path, title, renderInto }) {
    const router = vm.$router;
    if (!router || typeof router.addRoute !== "function" || typeof router.getRoutes !== "function") return false;
    const sibling = router.getRoutes().find((record) => record.path === "/works");
    const layout = sibling && sibling.parent;
    if (!layout || !layout.components || !layout.components.default) return false;
    const page = {
      name: `Aop${path.replace(/\W/g, "")}Page`,
      render(h) {
        return h("div", { class: "aop-page" });
      },
      mounted() {
        this.previousTitle = pageWindow.document.title;
        pageWindow.document.title = title();
        this.stopLocale = onLocaleChange(() => {
          pageWindow.document.title = title();
        });
        this.cleanup = renderInto(this.$el);
      },
      beforeDestroy() {
        this.stopLocale();
        pageWindow.document.title = this.previousTitle;
        if (typeof this.cleanup === "function") this.cleanup();
      }
    };
    router.addRoute({
      path: layout.path || "/",
      component: layout.components.default,
      meta: layout.meta,
      children: [{ path: path.replace(/^\//, ""), component: page, meta: layout.meta }]
    });
    const rematch = () => {
      const loc = pageWindow.location;
      const current = router.currentRoute;
      if (loc.pathname !== path || !current.matched.some((record) => record.path === "*")) return;
      router.replace({ path, query: current.query, hash: current.hash }).catch(() => {
      });
    };
    if (typeof router.onReady === "function") router.onReady(rematch);
    else rematch();
    return true;
  }
  /*! 历史页面与实时进度展示。页面销毁时解除 Vuex/语言订阅，避免反复进入后重复监听。 */
  var HISTORY_PATH = "/history";
  var LIVE_MUTATIONS = [
    "AudioPlayer/SET_CURRENT_TIME",
    "AudioPlayer/SET_DURATION",
    "AudioPlayer/ON_PLAY",
    "AudioPlayer/ON_PAUSE",
    "AudioPlayer/SET_TRACK",
    "AudioPlayer/SET_QUEUE"
  ];
  var historyView = {
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
      const hasPage = addPage(vm, { path: HISTORY_PATH, title: () => `${tr("history")} - ASMR Online`, renderInto: (container) => this.mountLive(container) });
      const open = hasPage ? () => vm.$router.push(HISTORY_PATH).catch(() => {
      }) : () => this.togglePanel();
      const inNav = addNavItem({
        id: "history",
        label: () => tr("history"),
        iconSvg: ICONS.history,
        href: hasPage ? HISTORY_PATH : null,
        onClick: open,
        isActive: () => vm.$route && vm.$route.path === HISTORY_PATH,
        after: ['[data-aop-nav="favorites"]', "/playlists"],
        onInsert: () => {
          const fab = pageWindow.document.querySelector(".aop-fab");
          if (fab) fab.remove();
        }
      });
      if (!inNav) {
        setTimeout(() => {
          if (!pageWindow.document.querySelector('[data-aop-nav="history"]')) {
            const fab = el("button", { class: "aop-fab", onclick: open }, tr("history"));
            onLocaleChange(() => {
              fab.textContent = tr("history");
            });
            pageWindow.document.body.append(fab);
          }
        }, 5e3);
      }
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(tr("history"), open);
    },
    togglePanel() {
      if (this.panel) {
        this.panelCleanup();
        this.panel.remove();
        this.panel = null;
      } else {
        this.panel = el("div", { class: "aop-panel aop-page" });
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
        const first = container.querySelector(".aop-row");
        const row = container.querySelector(`.aop-row[data-work-id="${workId}"]`);
        if (!row || row !== first) {
          const saved = historyStore.all()[0];
          if (saved && saved.workId === workId && (mutation.type !== "AudioPlayer/SET_CURRENT_TIME" || Date.now() - lastRenderAt > 1e3)) {
            lastRenderAt = Date.now();
            this.renderInto(container);
          }
          return;
        }
        this.patchRow(row, { trackTitle: track.title || "", t: player.currentTime, d: player.duration, playing: player.playing });
      });
      return () => {
        stop();
        stopLocale();
        if (this.container === container) this.container = null;
      };
    },
    patchRow(row, { trackTitle, t, d, playing }) {
      const finished = isFinished(t, d);
      row.querySelector(".aop-track").textContent = tr("trackLine", playing, trackTitle);
      row.querySelector(".aop-track").title = trackTitle;
      row.querySelector(".aop-fill").style.width = `${finished ? 100 : d ? Math.min(100, t / d * 100) : 0}%`;
      row.querySelector(".aop-time").textContent = finished ? tr("finished") : d ? `${formatTime(t)} / ${formatTime(d)}` : formatTime(t);
      row.querySelector(".aop-when").textContent = `${row.dataset.sourceId} · ${playing ? tr("nowPlaying") : formatAgo(Date.now())}`;
      row.querySelector(".aop-resume").textContent = finished ? tr("replay") : tr("resume");
    },
    groupLabel(timestamp) {
      const day = (t) => new Date(t).toDateString();
      const now = Date.now();
      if (day(timestamp) === day(now)) return tr("today");
      if (day(timestamp) === day(now - 864e5)) return tr("yesterday");
      return tr("earlier");
    },
    renderInto(container) {
      const vm = this.vm;
      const rerender = () => this.renderInto(container);
      const openWork = (entry) => vm.$router.push(`/work/${entry.sourceId}`);
      const entries = historyStore.all();
      const row = (entry) => {
        const finished = isFinished(entry.t, entry.d);
        const percent = entry.d ? Math.min(100, entry.t / entry.d * 100) : 0;
        return el("div", { class: "aop-row", "data-work-id": String(entry.workId), "data-source-id": entry.sourceId }, [
          el("img", { class: "aop-cover", src: `${getApiBase(vm)}/api/cover/${entry.workId}.jpg?type=240x240`, loading: "lazy", onclick: () => openWork(entry) }),
          el("div", { class: "aop-info" }, [
            el("div", { class: "aop-title", title: entry.workTitle, onclick: () => openWork(entry) }, entry.workTitle),
            el("div", { class: "aop-sub aop-when" }, `${entry.sourceId} · ${formatAgo(entry.updatedAt)}`),
            el("div", { class: "aop-sub aop-track", title: entry.trackTitle }, tr("trackLine", false, entry.trackTitle)),
            el("div", { class: "aop-progress" }, [
              el("div", { class: "aop-bar" }, el("div", { class: "aop-fill", style: `width: ${finished ? 100 : percent}%` })),
              el("span", { class: "aop-time" }, finished ? tr("finished") : entry.d ? `${formatTime(entry.t)} / ${formatTime(entry.d)}` : formatTime(entry.t))
            ])
          ]),
          el("div", { class: "aop-actions" }, [
            el("button", { class: "aop-btn aop-resume", onclick: () => {
              const track = currentTrack(vm.$store.state);
              if (track && trackWorkInfo(track).workId === entry.workId) {
                return resumeFromHistory(vm, { ...trackWorkInfo(track), trackHash: track.hash });
              }
              const latest = historyStore.all().find((item) => item.workId === entry.workId);
              if (latest) return resumeFromHistory(vm, latest);
            } }, finished ? tr("replay") : tr("resume")),
            el("button", { class: "aop-btn aop-flat", title: tr("removeFromHistory"), onclick: () => {
              if (!pageWindow.confirm(tr("confirmRemoveHistory"))) return;
              historyStore.remove(entry.workId);
              rerender();
            } }, tr("remove"))
          ])
        ]);
      };
      const body = [];
      let currentGroup = null;
      let card = null;
      for (const entry of entries) {
        const label = this.groupLabel(entry.updatedAt);
        if (label !== currentGroup) {
          currentGroup = label;
          card = el("div", { class: "aop-card" });
          body.push(el("div", { class: "aop-date-group" }, label), card);
        }
        card.append(row(entry));
      }
      container.replaceChildren(
        el("div", { class: "aop-head" }, [
          el("h1", {}, tr("history")),
          el("span", { class: "aop-count" }, tr("workCount", entries.length)),
          el("span", { class: "aop-spacer" }),
          entries.length ? el("button", { class: "aop-btn aop-flat", onclick: () => {
            if (pageWindow.confirm(tr("confirmClearHistory"))) {
              historyStore.clear();
              rerender();
            }
          } }, tr("clearHistory")) : null,
          this.panel ? el("button", { class: "aop-btn aop-flat", onclick: () => this.togglePanel() }, tr("close")) : null
        ]),
        ...body.length ? body : [el("div", { class: "aop-card" }, el("div", { class: "aop-empty" }, tr("historyEmpty")))]
      );
    }
  };
  /*! 进度清除的用户操作层：负责确认、当前音轨重置和格式关联清除，不删除历史或关注。 */
  var progressActions = {
    matchesCurrent(vm, file) {
      const player = vm.$store.state.AudioPlayer;
      const track = currentTrack(vm.$store.state);
      if (!track) return false;
      if (track.hash === file.hash) return true;
      return progressSiblings({ [track.hash]: { title: track.title, d: player.duration || track.duration || 0, updatedAt: 0 } }, file).includes(track.hash);
    },
    clearTrack(vm, file) {
      if (!file?.hash) return;
      const notice = this.matchesCurrent(vm, file) ? `

${tr("resetCurrentNotice")}` : "";
      if (!pageWindow.confirm(tr("confirmClearTrackProgress") + notice)) return;
      const reset = progressFeature.resetCurrent(file);
      const changed = progressStore.clear(file.hash, file.title, file.duration);
      if (reset && !changed) progressStore.changed();
    },
    clearAll(vm) {
      const notice = currentTrack(vm.$store.state) ? `

${tr("resetCurrentNotice")}` : "";
      if (!pageWindow.confirm(tr("confirmClearProgress") + notice)) return;
      progressStore.clearAll();
    },
    trackButton(vm, file) {
      const button = el("button", {
        type: "button",
        class: "aop-track-clear",
        onclick: (event) => {
          event.stopPropagation();
          this.clearTrack(vm, button.aopFile);
        },
        oncontextmenu: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      });
      this.updateTrackButton(button, file);
      return button;
    },
    updateTrackButton(button, file) {
      button.aopFile = file;
      const label = `${tr("clearTrackProgress")}：${file.title || file.hash}`;
      if (button.getAttribute("aria-label") !== label) {
        button.setAttribute("aria-label", label);
        button.title = label;
      }
      const text = tr("clearTrackProgressButton");
      if (button.textContent !== text) button.textContent = text;
    }
  };
  /*! 网站 AudioElement 适配：定位原生播放器，并抑制清除进度后由 canplay 引起的自动播放。 */
  var guardedComponents = new WeakSet();
  function findAudioComponent(vm) {
    const nodes = [vm.$root || vm], seen = new Set();
    while (nodes.length) {
      const component = nodes.pop();
      if (!component || seen.has(component) || component._isDestroyed) continue;
      seen.add(component);
      if (component.$options?.name === "AudioElement") return component;
      nodes.push(...component.$children || []);
    }
    return null;
  }
  function guardResetAutoplay(component, shouldStayPaused) {
    if (!component || guardedComponents.has(component) || typeof component.onCanplay !== "function") return;
    const onCanplay = component.onCanplay;
    component.onCanplay = function(...args) {
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
  /*! 字幕适配：补载所选字幕、识别文本编码，并在续播/跳转后同步网站的 LRC 解析器。 */
  function decodeSubtitle(bytes, charset) {
    const decode = (encoding) => {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch (err) {
        return null;
      }
    };
    if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
    if (charset) return new TextDecoder(charset, { fatal: true }).decode(bytes);
    const utf8 = decode("utf-8");
    if (utf8 != null) return utf8;
    const sjis = decode("shift_jis");
    if (sjis != null && !/[\uFF61-\uFF9F]/.test(sjis)) return sjis;
    const gb = decode("gb18030");
    if (gb != null) return gb;
    if (sjis != null) return sjis;
    throw new Error("无法识别字幕编码");
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
          if (url.protocol !== "https:" || url.username || url.password) throw new Error("不支持的字幕地址");
          const response = await fetch(url.href, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal });
          if (!response.ok) throw new Error("字幕请求失败");
          const buffer = await response.arrayBuffer(), bytes = new Uint8Array(buffer);
          const charset = response.headers?.get("content-type")?.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
          const text = decodeSubtitle(bytes, charset);
          if (controller.signal.aborted || state.Settings?.enableSubtitle === false || !text || state.AudioPlayer.queue !== queue || queue[index] !== track || state.AudioPlayer.queueIndex !== index || track.availableLyrics?.[lyricIndex] !== lyric || track.selectedLyricIndex !== lyricIndex) return;
          store.commit("AudioPlayer/SET_LYRIC_CONTENT", { content: text, forQueueIndex: index, forSelectedLyricIndex: lyricIndex });
          failed = null;
        } catch (err) {
          if (controller.signal.aborted) return;
          const firstFailure = failed !== lyric;
          failed = lyric;
          console.error(LOG_PREFIX, "字幕正文加载失败");
          if (firstFailure && currentTrack(state) === track) notify(vm, tr("subtitleLoadFailed"));
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
        if (node.$options?.name === "AudioElement") return component = node;
        nodes.push(...node.$children || []);
      }
      return null;
    };
    return (type) => {
      if (!["SET_CURRENT_TIME", "SET_LYRIC_CONTENT", "SET_LYRIC_INDEX", "SET_LYRIC_INDEX_AUTO", "SET_QUEUE", "SET_TRACK", "NEXT_TRACK", "PREVIOUS_TRACK", "EMPTY_QUEUE", "REMOVE_FROM_QUEUE", "ON_PLAY", "ON_PAUSE", "WANT_SEEK", "SUBTITLE_SETTING"].includes(type)) return;
      force ||= type !== "SET_CURRENT_TIME";
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        const mustSync = force;
        force = false;
        try {
          loadSelected(mustSync);
          const audio = find();
          if (!audio?.lrcObj || typeof audio.updateLyricPos !== "function") return;
          const text = audio.lyricContent || "";
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
          console.error(LOG_PREFIX, "字幕同步失败", err);
        }
      };
      if (typeof vm.$nextTick === "function") vm.$nextTick(run);
      else Promise.resolve().then(run);
    };
  }
  /*! 播放事件协调：实时位置先留在内存，定时或在暂停、切歌、离开页面时写入；界面可实时读取网站状态。 */
  /*! 历史与进度分开：开始播放即可记录历史；正数位置即可保存，无需先播放满 5 秒；听完则移除续播进度。 */
  function recordPosition(track, t, d) {
    if (!Number.isFinite(t) || t < 0) return;
    d = Number.isFinite(d) && d > 0 ? d : 0;
    if (isFinished(t, d)) progressStore.clear(track.hash, track.title, d);
    else if (t > 0) progressStore.save(track.hash, t, d, track.title);
    historyStore.touch({ ...trackWorkInfo(track), trackHash: track.hash, trackTitle: track.title || "", t, d });
  }
  var progressFeature = {
    name: "progress",
    clearedHash: null,
    init(vm) {
      const store = vm.$store;
      const syncSubtitles = createSubtitleSync(vm);
      let lastSaveAt = 0;
      let resumedHash = null;
      let lastKnown = null;
      let forgottenHash = null;
      let recorded = null;
      let resetting = false;
      let resetMedia = null;
      let observedHash = currentTrack(store.state)?.hash;
      let positionReady = true;
      const record = (snapshot) => {
        if (recorded && recorded.hash === snapshot.track.hash && recorded.t === snapshot.t) return;
        recordPosition(snapshot.track, snapshot.t, snapshot.d);
        recorded = { hash: snapshot.track.hash, t: snapshot.t };
      };
      historyStore.onDelete((workId) => {
        resumeState.requestId++;
        const track = currentTrack(store.state);
        if (workId == null || track && trackWorkInfo(track).workId === workId) {
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
        let media = component?.player?.media || component?.$el?.querySelector?.("audio");
        if (!media) {
          const audio = pageWindow.document.querySelectorAll("audio");
          if (audio.length === 1) media = audio[0];
        }
        resetMedia = media;
        resetting = true;
        try {
          store.commit("AudioPlayer/WANT_PAUSE");
          if (media && typeof media.pause === "function") media.pause();
          if (media) {
            try {
              media.currentTime = 0;
            } catch {
            }
          }
          store.commit("AudioPlayer/SET_CURRENT_TIME", 0);
          store.commit("AudioPlayer/ON_PAUSE");
        } finally {
          resetting = false;
        }
        return true;
      };
      progressStore.onClear(() => this.resetCurrent());
      store.subscribe((mutation, state) => {
        if (resetting) return;
        if (mutation.type.startsWith("AudioPlayer/")) syncSubtitles(mutation.type.slice("AudioPlayer/".length));
        else if (mutation.type === "Settings/UPDATE_SETTING" && mutation.payload?.key === "enableSubtitle") syncSubtitles("SUBTITLE_SETTING");
        const trackMutation = ["SET_QUEUE", "SET_TRACK", "NEXT_TRACK", "PREVIOUS_TRACK", "EMPTY_QUEUE", "REMOVE_FROM_QUEUE"].some((type) => mutation.type === `AudioPlayer/${type}`);
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
        if (this.clearedHash === track.hash) {
          const playRequested = mutation.type === "AudioPlayer/WANT_PLAY" || mutation.type === "AudioPlayer/TOGGLE_WANT_PLAYING" && !player.playing || mutation.type === "AudioPlayer/SET_TRACK" || mutation.type === "AudioPlayer/SET_QUEUE" && mutation.payload?.resetPlaying;
          if (playRequested) this.clearedHash = null;
          else if (mutation.type === "AudioPlayer/ON_PLAY") {
            if (resetMedia && typeof resetMedia.pause === "function") resetMedia.pause();
            store.commit("AudioPlayer/WANT_PAUSE");
            store.commit("AudioPlayer/ON_PAUSE");
            return;
          }
        }
        if (mutation.type === "AudioPlayer/ON_PLAY") {
          forgottenHash = null;
          this.clearedHash = null;
          lastKnown = {
            track,
            t: positionReady && Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0,
            d: positionReady ? player.duration : track.duration
          };
          record(lastKnown);
          lastSaveAt = Date.now();
        }
        if (mutation.type === "AudioPlayer/SET_CURRENT_TIME") {
          if (track.hash === forgottenHash && !player.playing) return;
          forgottenHash = null;
          this.clearedHash = null;
          positionReady = true;
          lastKnown = { track, t: player.currentTime, d: player.duration };
        }
        if (mutation.type === "AudioPlayer/SET_DURATION") {
          if (resumedHash === track.hash) return;
          resumedHash = track.hash;
          const saved = progressStore.find({ hash: track.hash, title: track.title, duration: player.duration });
          if (saved && saved.t > 0 && !isFinished(saved.t, player.duration)) {
            store.commit("AudioPlayer/WANT_SEEK", saved.t);
          }
        } else if (mutation.type === "AudioPlayer/SET_CURRENT_TIME") {
          if (Date.now() - lastSaveAt >= SAVE_INTERVAL_MS) saveNow();
        } else if (mutation.type === "AudioPlayer/ON_PAUSE") {
          saveNow();
        } else if (trackMutation) {
          resumedHash = null;
        }
      });
      pageWindow.addEventListener("pagehide", saveNow);
      pageWindow.document.addEventListener("visibilitychange", () => {
        if (pageWindow.document.visibilityState === "hidden") saveNow();
      });
      historyView.mount(vm);
      trackHints.mount(vm);
    }
  };
  var trackHints = {
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
            console.error(LOG_PREFIX, "音轨进度提示", err);
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
      const root = pageWindow.document.querySelector("#work-tree");
      let tree = null;
      for (let comp = root && root.__vue__; comp && comp.$el === root; comp = comp.$parent) {
        if (comp.$options && comp.$options.name === "WorkTree") tree = comp;
      }
      if (!tree || !Array.isArray(tree.currentFolder)) return;
      for (const row of root.querySelectorAll(".q-item")) {
        let index = null;
        for (let comp = row.__vue__; comp && comp.$el === row; comp = comp.$parent) {
          if (typeof comp.$vnode?.key === "number") index = comp.$vnode.key;
        }
        const file = index == null ? null : tree.currentFolder[index];
        let hint = [...row.children].find((child) => child.classList.contains("aop-track-hint"));
        let saved = null;
        if (file && file.type === "audio" && file.hash) {
          saved = this.positionOf(file);
        }
        if (!saved) {
          if (hint) hint.remove();
          continue;
        }
        if (!hint) {
          hint = el("div", { class: "aop-track-hint" }, [
            el("div", { class: "aop-bar" }, el("div", { class: "aop-fill" })),
            el("span", { class: "aop-track-hint-text" }),
            progressActions.trackButton(this.vm, file)
          ]);
          row.append(hint);
        }
        progressActions.updateTrackButton(hint.querySelector(".aop-track-clear"), file);
        const d = saved.d || file.duration || 0;
        const width = `${d ? Math.min(100, saved.t / d * 100) : 0}%`;
        const text = tr("listenedTo", formatTime(saved.t));
        const label = hint.querySelector(".aop-track-hint-text");
        if (label.textContent !== text) label.textContent = text;
        const fill = hint.querySelector(".aop-fill");
        if (fill.style.width !== width) fill.style.width = width;
      }
    }
  };
  /*! 备份边界：仅处理脚本本地数据，不导出网站登录令牌；导入采用校验、合并、写入和失败回滚。 */
  var backupFeature = {
    name: "backup",
    read() {
      return this.clean({ history: historyStore.all(), progress: progressStore.all(), favorites: favoritesStore.all(), favoritesTab: storage.get("favorites-tab", "va") }, { lenient: true });
    },
    skipped: 0,
    /*! 读取本地数据时允许跳过坏记录，导入文件则严格校验；返回字段白名单，避免直接保存任意输入对象。 */
    clean(data, { lenient = false } = {}) {
      let skipped = 0;
      const object = (value) => value && typeof value === "object" && !Array.isArray(value);
      const list = (value, max) => {
        if (lenient && value == null) return [];
        if (!Array.isArray(value) || !lenient && value.length > max) throw new Error(tr("backupBadList"));
        return lenient ? value.slice(0, max) : value;
      };
      const each = (values, fn) => values.flatMap((value) => {
        if (!lenient) return [fn(value)];
        try {
          return [fn(value)];
        } catch {
          skipped++;
          return [];
        }
      });
      const text = (value, max = 2048, empty = false) => {
        if (typeof value !== "string" || !empty && !value.trim() || value.length > max) throw new Error(tr("backupBadText"));
        return value;
      };
      const number = (value = 0) => {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
          if (lenient) return 0;
          throw new Error(tr("backupBadNumber"));
        }
        return value;
      };
      const hash = (value) => {
        if (!/^\d+\/[^\s]{1,512}$/.test(text(value, 530))) throw new Error(tr("backupBadTrack"));
        return value;
      };
      if (lenient && object(data)) {
        data = { ...data, favorites: object(data.favorites) ? data.favorites : {}, progress: object(data.progress) ? data.progress : {} };
      }
      if (!object(data) || !object(data.favorites) || !object(data.progress)) throw new Error(tr("backupBadStructure"));
      const history = each(list(data.history, 5e3), (item) => {
        if (!object(item) || !Number.isSafeInteger(item.workId) || item.workId <= 0) throw new Error(tr("backupBadWork"));
        const sourceId = text(item.sourceId, 80);
        if (!/^[a-zA-Z0-9_-]+$/.test(sourceId)) throw new Error(tr("backupBadSource"));
        const trackHash = hash(item.trackHash);
        if (Number(trackHash.split("/")[0]) !== item.workId) throw new Error(tr("backupTrackMismatch"));
        return { workId: item.workId, sourceId, workTitle: text(item.workTitle), trackHash, trackTitle: text(item.trackTitle, 2048, true), t: number(item.t), d: number(item.d), updatedAt: number(item.updatedAt) };
      });
      let positions = Object.entries(data.progress);
      if (positions.length > 5e4) {
        if (!lenient) throw new Error(tr("backupTooManyProgress"));
        positions = positions.sort(([, a], [, b]) => (b?.updatedAt || 0) - (a?.updatedAt || 0)).slice(0, 5e4);
      }
      const progress = Object.fromEntries(each(positions, ([key, item]) => {
        if (!object(item)) throw new Error(tr("backupBadProgress"));
        const title = typeof item.title === "string" && item.title.trim() && item.title.length <= 2048 ? { title: item.title } : {};
        return [hash(key), { t: number(item.t), d: number(item.d), ...title, updatedAt: number(item.updatedAt) }];
      }));
      const favorites = { groups: {} };
      for (const [type, { inbox }] of Object.entries(FAVORITE_TYPES)) {
        const names = each(list(data.favorites.groups?.[type], 1e3), (value) => text(value, 256));
        favorites.groups[type] = [...new Set([...names.map((name) => name === "未分组" ? inbox : name), inbox])];
        favorites[type] = each(list(data.favorites[type], 2e4), (item) => {
          if (!object(item)) throw new Error(tr("backupBadFollow"));
          const id = typeof item.id === "number" ? String(number(item.id)) : text(item.id, 512);
          const group = item.group === "未分组" ? inbox : item.group;
          const result = { id, name: text(item.name, 512), group: favorites.groups[type].includes(group) ? group : inbox, addedAt: number(item.addedAt) };
          if (item.siteId != null) result.siteId = typeof item.siteId === "number" ? number(item.siteId) : text(item.siteId, 512);
          if (item.aliases != null) result.aliases = [...new Set(each(list(item.aliases, 1e3), (value) => text(value, 512)))];
          return result;
        });
      }
      this.skipped = skipped;
      return { history, progress, favorites, favoritesTab: Object.hasOwn(FAVORITE_TYPES, data.favoritesTab) ? data.favoritesTab : "va" };
    },
    // version 是备份格式版本，scriptVersion 才是脚本版本；两者不要一起随发布递增。
    make() {
      return { format: "asmr-one-plus-backup", version: 1, scriptVersion: SCRIPT_VERSION, exportedAt: (new Date()).toISOString(), data: this.read() };
    },
    parse(text) {
      if (typeof text !== "string" || text.length > 10 * 1024 * 1024) throw new Error(tr("backupInvalidFile"));
      let file;
      try {
        file = JSON.parse(text);
      } catch {
        throw new Error(tr("backupNotJson"));
      }
      if (file?.format !== "asmr-one-plus-backup" || file.version !== 1) throw new Error(tr("backupUnsupported"));
      return this.clean(file.data);
    },
    /*! 合并不覆盖已有关注的分组；历史按作品、进度按 hash 取较新记录，已有数据时保留本地选中的标签页。 */
    merge(incoming, current = this.read()) {
      const hadLocal = current.history.length || Object.keys(current.progress).length || Object.keys(FAVORITE_TYPES).some((type) => current.favorites[type].length || current.favorites.groups[type].length > 1);
      const favorites = current.favorites;
      for (const type of Object.keys(FAVORITE_TYPES)) {
        favorites.groups[type] = [...new Set([...favorites.groups[type], ...incoming.favorites.groups[type]])];
        for (const item of incoming.favorites[type]) {
          const existing = favorites[type].find((entry) => sameFavorite(entry, item));
          if (!existing) favorites[type].push(item);
          else {
            if (existing.siteId == null && item.siteId != null) existing.siteId = item.siteId;
            existing.aliases = [...new Set([...favoriteNames(existing), ...favoriteNames(item)])];
          }
        }
      }
      const byWork = new Map();
      for (const item of [...incoming.history, ...current.history]) if (!byWork.has(item.workId) || item.updatedAt >= byWork.get(item.workId).updatedAt) byWork.set(item.workId, item);
      const history = [...byWork.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, HISTORY_LIMIT);
      const progress = current.progress;
      for (const [key, value] of Object.entries(incoming.progress)) if (!progress[key] || value.updatedAt > progress[key].updatedAt) progress[key] = value;
      for (const entry of history) if (isFinished(entry.t, entry.d) && progress[entry.trackHash] && entry.updatedAt >= progress[entry.trackHash].updatedAt) delete progress[entry.trackHash];
      return { favorites, history, progress, favoritesTab: hadLocal ? current.favoritesTab : incoming.favoritesTab };
    },
    apply(incoming) {
      const keys = ["history", "progress", "favorites", "favorites-tab"];
      const before = Object.fromEntries(keys.map((key) => [key, storage.get(key, void 0)]));
      const next = this.merge(this.clean(incoming), this.read());
      try {
        storage.set("history", next.history);
        storage.set("progress", next.progress);
        storage.set("favorites", { ...before.favorites, ...next.favorites, groups: { ...before.favorites?.groups, ...next.favorites.groups } });
        storage.set("favorites-tab", next.favoritesTab);
      } catch {
        try {
          for (const key of keys) {
            if (before[key] === void 0) storage.remove(key);
            else storage.set(key, before[key]);
          }
        } catch {
          throw new Error(tr("storageFailed"));
        }
        throw new Error(tr("importRolledBack"));
      }
      progressFeature.invalidate?.();
      progressStore.changed();
      for (const fn of favoritesStore.listeners) fn();
      if (historyView.container?.isConnected) historyView.renderInto(historyView.container);
    },
    download(vm) {
      try {
        const json = JSON.stringify(this.make(), null, 2);
        if (this.skipped) notify(vm, tr("exportSkipped", this.skipped));
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = el("a", { href: url, download: `asmr-one-plus-data-${(new Date()).toISOString().replace(/[:.]/g, "-")}.json` });
        pageWindow.document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      } catch {
        notify(vm, tr("exportFailed"));
      }
    },
    choose(vm) {
      const input = el("input", { type: "file", accept: ".json,application/json", style: "display:none", "data-aop-backup-file": "" });
      input.addEventListener("cancel", () => input.remove());
      input.addEventListener("change", async () => {
        try {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) throw new Error(tr("backupTooLarge"));
          const data = this.parse(await file.text());
          const count = Object.keys(FAVORITE_TYPES).reduce((sum, type) => sum + data.favorites[type].length, 0);
          this.read();
          if (!pageWindow.confirm(tr("importConfirm", count, data.history.length, Object.keys(data.progress).length, this.skipped))) return;
          this.apply(data);
          notify(vm, tr("importDone"));
        } catch (err) {
          notify(vm, err.message || tr("importFailed"));
        } finally {
          input.remove();
        }
      });
      pageWindow.document.body.append(input);
      input.click();
    },
    buttons(vm) {
      const menu = el("details", { class: "aop-backup" });
      if (!this.outsideCloser) {
        this.outsideCloser = (event) => {
          for (const open of pageWindow.document.querySelectorAll("details.aop-backup[open]")) if (!open.contains(event.target)) open.open = false;
        };
        pageWindow.document.addEventListener("click", this.outsideCloser, true);
      }
      const pick = (action) => () => {
        menu.open = false;
        action();
      };
      menu.append(
        el("summary", { class: "aop-btn aop-data-button" }, tr("backup")),
        el("div", { class: "aop-backup-menu" }, [
          el("button", { class: "aop-btn aop-flat", "data-aop-backup": "export", onclick: pick(() => this.download(vm)) }, tr("exportBackup")),
          el("button", { class: "aop-btn aop-flat", "data-aop-backup": "import", onclick: pick(() => this.choose(vm)) }, tr("importBackup"))
        ])
      );
      return [menu];
    }
  };
  /*! 完整搜索快照：异步保存在当前站点的 IndexedDB，不写入个人数据备份。 */
  var CACHE_TTL = 5 * 60 * 1e3;
  var CACHE_LIMIT = 3;
  var memory = new Map();
  var database;
  var generation = 0;
  function openCache() {
    if (!database) database = new Promise((resolve) => {
      try {
        const request = pageWindow.indexedDB.open("asmr-one-plus-solo", 1);
        let expired = false;
        const timeout = setTimeout(() => {
          expired = true;
          resolve(null);
        }, 200);
        request.onupgradeneeded = () => request.result.createObjectStore("searches", { keyPath: "key" });
        request.onerror = request.onblocked = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        request.onsuccess = () => {
          clearTimeout(timeout);
          const db = request.result;
          if (expired) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            database = null;
          };
          resolve(db);
        };
      } catch {
        resolve(null);
      }
    });
    return database;
  }
  function valid(entry) {
    return entry && Number.isFinite(entry.createdAt) && Date.now() >= entry.createdAt && Date.now() - entry.createdAt < CACHE_TTL && Array.isArray(entry.result?.works) && Number.isSafeInteger(entry.result.pagination?.totalCount) && Array.isArray(entry.result.sourcePositions) && entry.result.sourcePositions.length === entry.result.works.length && entry.result.sourcePositions.every((position, i, positions) => Number.isSafeInteger(position) && position >= 0 && position < entry.result.pagination.totalCount && (i === 0 || position > positions[i - 1]));
  }
  function remember(entry) {
    memory.delete(entry.key);
    memory.set(entry.key, entry);
    while (memory.size > CACHE_LIMIT) memory.delete(memory.keys().next().value);
  }
  function publicResult(result) {
    const works = result.works.map(({ playlistStatus, userRating, progress, review_text, ...work }) => ({ ...work, playlistStatus: null, userRating: null }));
    return { ...result, works };
  }
  async function readSoloCache(key) {
    const local = memory.get(key);
    if (valid(local)) {
      remember(local);
      return publicResult(local.result);
    }
    memory.delete(key);
    const epoch = generation;
    const db = await openCache();
    if (!db || epoch !== generation) return null;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 200);
      const done = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };
      try {
        const request = db.transaction("searches").objectStore("searches").get(key);
        request.onerror = () => done(null);
        request.onsuccess = () => {
          const entry = request.result;
          if (epoch !== generation || !valid(entry)) return done(null);
          remember(entry);
          done(publicResult(entry.result));
        };
      } catch {
        done(null);
      }
    });
  }
  async function writeSoloCache(key, result) {
    const entry = { key, result: publicResult(result), createdAt: Date.now() };
    remember(entry);
    const epoch = generation;
    const db = await openCache();
    if (!db || epoch !== generation) return;
    await new Promise((resolve) => {
      try {
        const transaction = db.transaction("searches", "readwrite");
        transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
        const store = transaction.objectStore("searches");
        store.put(entry);
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = request.result.sort((a, b) => b.createdAt - a.createdAt);
          entries.forEach((item, i) => {
            if (i >= CACHE_LIMIT || !valid(item)) store.delete(item.key);
          });
        };
      } catch {
        resolve();
      }
    });
  }
  async function clearSoloCache() {
    generation++;
    memory.clear();
    const db = await openCache();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const transaction = db.transaction("searches", "readwrite");
        transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
        transaction.objectStore("searches").clear();
      } catch {
        resolve();
      }
    });
  }
  async function removeSoloCache(key) {
    memory.delete(key);
    const db = await openCache();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const transaction = db.transaction("searches", "readwrite");
        transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
        transaction.objectStore("searches").delete(key);
      } catch {
        resolve();
      }
    });
  }
  /*! 单人出演：按原站顺序收集单人作品，再把真实总数和当前页交给原站分页器。 */
  var SOLO_QUERY = "aopSolo";
  var SOURCE_PAGE_SIZE = 999;
  var SOURCE_CONCURRENCY = 4;
  var sharedIndex = null;
  function hasSingleActor(owner) {
    if (owner.$route?.path !== "/works") return false;
    const terms = owner.parsedKeyword?.specialTerms || [];
    const actors = new Set(terms.filter(({ namespace, isExclude, value }) => (namespace === "va" || namespace === "v") && !isExclude && value).map(({ value }) => value));
    return actors.size === 1;
  }
  function soloEnabled(owner) {
    return owner.$route?.query?.[SOLO_QUERY] === "1" && hasSingleActor(owner);
  }
  function isSoloWork(work) {
    return Array.isArray(work?.vas) && work.vas.length === 1 && Boolean(work.vas[0]?.name);
  }
  function searchQuery(owner) {
    const { page, pageSize, ...params } = owner.requestParams;
    return { page, pageSize: Number(pageSize), params, key: JSON.stringify([getApiBase(owner), owner.loggedIn, owner.userName, params]) };
  }
  async function loadSoloWorks(owner, params, token, onProgress, previewSize, seed = null) {
    token.throwIfRequested();
    const request = owner.$options.methods.makeMainRequest;
    const { keyword, globalFilter } = owner;
    const fetchPage = async (page, size) => {
      token.throwIfRequested();
      const context = Object.create(owner, {
        keyword: { value: keyword },
        globalFilter: { value: globalFilter },
        requestParams: { value: { ...params, withPlaylistStatus: [], page, pageSize: size } }
      });
      try {
        return await request.call(context, token);
      } catch (error) {
        if (size <= 400 || error.response?.status !== 400 || !error.response.data?.errors?.some((item) => item.param === "pageSize")) throw error;
        return fetchPage(page, size > 500 ? 500 : 400);
      }
    };
    const validPagination = (data) => Number.isSafeInteger(data?.pagination?.totalCount) && data.pagination.totalCount >= 0 && Number.isInteger(data.pagination.pageSize) && data.pagination.pageSize >= 1;
    const validRows = (data, page, size, total) => {
      token.throwIfRequested();
      if (data.pagination?.currentPage !== page || data.pagination.pageSize !== size || data.pagination.totalCount !== total || !Array.isArray(data.works) || data.works.length !== Math.max(0, Math.min(size, total - (page - 1) * size))) {
        throw new Error("读取单人作品时搜索结果发生变化");
      }
      return data.works;
    };
    if (seed && (!validPagination(seed) || !Array.isArray(seed.works))) seed = null;
    let initialFetched = false;
    if (!seed) {
      const { data } = await fetchPage(1, previewSize || 400);
      if (!validPagination(data)) throw new Error("单人作品搜索返回了无效的分页数据");
      seed = data;
      initialFetched = true;
    }
    let prefix = [];
    if (seed?.pagination.currentPage === 1) {
      prefix = validRows(seed, 1, seed.pagination.pageSize, seed.pagination.totalCount).filter(isSoloWork);
      onProgress(prefix);
      if (seed.works.length === seed.pagination.totalCount) {
        if (new Set(seed.works.map((work) => work?.id)).size !== seed.works.length || seed.works.some((work) => work?.id == null)) {
          throw new Error("搜索结果出现重复或无效的作品编号");
        }
        return { works: prefix, sourcePositions: seed.works.flatMap((work, i) => isSoloWork(work) ? [i] : []), pagination: seed.pagination };
      }
    }
    const needPreview = !initialFetched && previewSize && prefix.length < 20 && seed.pagination.totalCount > previewSize;
    let pageSize = Math.min(SOURCE_PAGE_SIZE, Math.max(100, Math.ceil(seed.pagination.totalCount / (SOURCE_CONCURRENCY - (needPreview ? 1 : 0)))));
    let pageCount = Math.ceil(seed.pagination.totalCount / pageSize);
    let totalCount;
    let firstPagination;
    let firstError;
    let established = false;
    let signalFirst;
    const firstDone = new Promise((resolve) => {
      signalFirst = resolve;
    });
    const works = [];
    const sourcePositions = [];
    const seen = new Set();
    const pending = new Map();
    let committed = 1;
    let next = 2;
    const commit = (page, rows) => {
      pending.set(page, rows);
      while (pending.has(committed)) {
        for (const work of pending.get(committed)) {
          if (work?.id == null || seen.has(work.id)) throw new Error("搜索结果出现重复或无效的作品编号");
          seen.add(work.id);
          if (isSoloWork(work)) {
            works.push(work);
            sourcePositions.push(seen.size - 1);
          }
        }
        pending.delete(committed++);
        onProgress(works);
      }
    };
    const rest = async () => {
      while (true) {
        token.throwIfRequested();
        if (next > pageCount) {
          if (established) return;
          await firstDone;
          if (firstError) throw firstError;
          continue;
        }
        const page = next++;
        const response = await fetchPage(page, pageSize);
        await firstDone;
        if (firstError) throw firstError;
        commit(page, validRows(response.data, page, pageSize, totalCount));
      }
    };
    const main2 = async () => {
      try {
        const size = pageSize;
        const { data } = await fetchPage(1, size);
        if (!validPagination(data) || data.pagination.pageSize > size) throw new Error("单人作品搜索返回了无效的分页数据");
        totalCount = data.pagination.totalCount;
        pageSize = data.pagination.pageSize;
        firstPagination = data.pagination;
        pageCount = Math.ceil(totalCount / pageSize);
        commit(1, validRows(data, 1, pageSize, totalCount));
        established = true;
      } catch (error) {
        firstError = error;
        throw error;
      } finally {
        signalFirst();
      }
      await rest();
    };
    const foreground = async () => {
      if (needPreview) {
        try {
          const { data } = await fetchPage(1, previewSize);
          if (!established && validPagination(data) && data.pagination.pageSize <= previewSize && (!seed || data.pagination.totalCount === seed.pagination.totalCount)) {
            onProgress(validRows(data, 1, data.pagination.pageSize, data.pagination.totalCount).filter(isSoloWork));
          }
        } catch {
          token.throwIfRequested();
        }
      }
      await rest();
    };
    await Promise.all([main2(), foreground(), ...Array.from({ length: SOURCE_CONCURRENCY - 2 }, () => rest())]);
    token.throwIfRequested();
    return { works, sourcePositions, pagination: firstPagination };
  }
  async function refreshPageState(owner, result, start, rows, token, isCurrent) {
    const { params } = searchQuery(owner);
    const { keyword, globalFilter } = owner;
    const size = Math.min(100, result.pagination.pageSize);
    const pages = [...new Set(result.sourcePositions.slice(start, start + rows.length).map((position) => Math.floor(position / size) + 1))];
    const fresh = new Map();
    let next = 0;
    const worker = async () => {
      while (next < pages.length) {
        token.throwIfRequested();
        const page = pages[next++];
        const context = Object.create(owner, {
          keyword: { value: keyword },
          globalFilter: { value: globalFilter },
          requestParams: { value: { ...params, page, pageSize: size } }
        });
        const response = await owner.$options.methods.makeMainRequest.call(context, token);
        token.throwIfRequested();
        const { pagination, works } = response.data;
        if (pagination?.currentPage !== page || pagination.pageSize !== size || pagination.totalCount !== result.pagination.totalCount || !Array.isArray(works)) return false;
        for (const work of works) fresh.set(work.id, work);
      }
      return true;
    };
    const valid2 = (await Promise.all([worker(), worker()])).every(Boolean) && rows.every((work) => isSoloWork(fresh.get(work.id)));
    if (!isCurrent()) return true;
    if (!valid2) return false;
    for (const work of rows) {
      const update = fresh.get(work.id);
      work.playlistStatus = update.playlistStatus ?? null;
      work.userRating = update.userRating ?? null;
    }
    return true;
  }
  function bindWorks(owner, schedule) {
    const state = { index: null };
    const nativeRequest = owner.makeMainRequest;
    let stateRefresh;
    let nativeSnapshot;
    const captureNative = (data, key) => {
      const pagination = data?.pagination;
      if (!Array.isArray(data?.works) || !Number.isSafeInteger(pagination?.totalCount) || pagination.totalCount < 0 || !Number.isSafeInteger(pagination.currentPage) || pagination.currentPage < 1 || !Number.isSafeInteger(pagination.pageSize) || pagination.pageSize < 1 || data.works.length !== Math.max(0, Math.min(pagination.pageSize, pagination.totalCount - (pagination.currentPage - 1) * pagination.pageSize))) return;
      nativeSnapshot = { data: { ...data, works: data.works.slice() }, key, createdAt: Date.now() };
    };
    if (!soloEnabled(owner) && !owner.loading) captureNative({ works: owner.works, pagination: owner.pagination }, searchQuery(owner).key);
    const discard = () => {
      const index = state.index;
      if (index?.previewOwner === owner) index.showPage = null;
      if (index && !index.ready) index.source.cancel("Solo search changed");
      state.index = null;
    };
    const prepare = () => {
      const { page, pageSize, params, key } = searchQuery(owner);
      if (state.index?.source.token.reason) discard();
      if (state.index?.key !== key) {
        discard();
        if (sharedIndex?.key === key && !sharedIndex.source.token.reason) {
          state.index = sharedIndex;
        } else {
          if (sharedIndex) sharedIndex.source.cancel("Another solo search started");
          const source = owner.$axios.CancelToken.source();
          const index = { key, source, ready: false, works: [], showPage: null };
          state.index = index;
          sharedIndex = index;
          const firstSize = page === 1 && pageSize <= 20 ? 100 : 0;
          index.result = (async () => {
            const cached = await readSoloCache(key);
            source.token.throwIfRequested();
            if (searchQuery(owner).key !== key) throw new Error("Solo search changed");
            if (cached) {
              index.fromCache = true;
              return cached;
            }
            const seed = nativeSnapshot?.key === key && Date.now() - nativeSnapshot.createdAt < 3e4 ? nativeSnapshot.data : null;
            const result = await loadSoloWorks(owner, params, source.token, (works) => {
              index.works = works;
              index.showPage?.();
            }, firstSize, seed);
            void writeSoloCache(key, result);
            return result;
          })().then((result) => {
            index.ready = true;
            index.works = result.works;
            return result;
          }, (err) => {
            source.cancel("Solo search failed");
            throw err;
          }).finally(() => {
            if (sharedIndex === index) sharedIndex = null;
            schedule();
          });
          index.result.catch(() => {
          });
        }
        schedule();
      }
      return state.index;
    };
    const requestSolo = async (token) => {
      const { page, pageSize, key } = searchQuery(owner);
      prepare();
      const index = state.index;
      const offset = (page - 1) * pageSize;
      let shown = false;
      const stillOnPage = () => {
        if (token.reason || owner._isDestroyed || !soloEnabled(owner)) return false;
        const current = searchQuery(owner);
        return current.key === key && current.page === page && current.pageSize === pageSize;
      };
      const showPage = () => {
        if (shown || index.works.length < offset + pageSize || !stillOnPage()) return;
        owner.works = index.works.slice(offset, offset + pageSize);
        owner.loading = false;
        shown = true;
        schedule();
      };
      if (!index.ready) {
        index.previewOwner = owner;
        index.showPage = showPage;
        showPage();
      }
      let result;
      try {
        result = await index.result;
      } catch (err) {
        if (shown && index.showPage === showPage && stillOnPage()) owner.works = [];
        if (state.index === index) discard();
        throw err;
      } finally {
        if (index.showPage === showPage) index.showPage = null;
        token.throwIfRequested();
      }
      const last = Math.max(1, Math.ceil(result.works.length / pageSize));
      const currentPage = Math.min(Math.max(1, page), last);
      if (currentPage !== page && stillOnPage()) {
        const { path, query, hash } = owner.$route;
        owner.$router.replace({ path, query: { ...query, page: currentPage }, hash }).catch(() => {
        });
      }
      const start = (currentPage - 1) * pageSize;
      const rows = result.works.slice(start, start + pageSize);
      if (rows.length && (index.fromCache && owner.loggedIn || owner.requestParams.withPlaylistStatus?.length)) {
        const refresh = owner.$axios.CancelToken.source();
        stateRefresh = refresh;
        void refreshPageState(
          owner,
          result,
          start,
          rows,
          refresh.token,
          () => !refresh.token.reason && state.index === index && stillOnPage()
        ).then(async (valid2) => {
          if (valid2 || refresh.token.reason) return;
          await removeSoloCache(key);
          if (state.index !== index || !stillOnPage()) return;
          discard();
          owner.requestWorksQueue(false);
        }).catch((err) => {
          if (!refresh.token.reason) console.warn(LOG_PREFIX, "单人作品当前页标记刷新失败", err);
        });
      }
      return {
        data: {
          works: rows,
          pagination: { ...result.pagination, currentPage, pageSize, totalCount: result.works.length }
        }
      };
    };
    owner.makeMainRequest = function(token) {
      stateRefresh?.cancel("Page changed");
      if (!soloEnabled(owner)) {
        if (state.index && !state.index.ready) discard();
        return nativeRequest.call(this, token);
      }
      return requestSolo(token);
    };
    owner.$watch(() => [soloEnabled(owner), searchQuery(owner).key], ([enabled, key], [wasEnabled]) => {
      stateRefresh?.cancel("Search changed");
      if (state.index && (state.index.key !== key || !hasSingleActor(owner) || !enabled && !state.index.ready)) discard();
      if (enabled !== wasEnabled && owner.$route?.path === "/works") owner.requestWorksQueue();
      schedule();
    });
    owner.$watch(() => owner.loading, (loading) => {
      if (!loading && hasSingleActor(owner) && !soloEnabled(owner)) {
        captureNative({ works: owner.works, pagination: owner.pagination }, searchQuery(owner).key);
      }
    });
    owner.$once("hook:beforeDestroy", () => {
      stateRefresh?.cancel("Page closed");
      discard();
    });
    if (soloEnabled(owner)) owner.requestWorksQueue();
    return state;
  }
  function worksOwner(heading) {
    for (let node = heading; node; node = node.parentElement) {
      for (let owner = node.__vue__; owner; owner = owner.$parent) {
        if (owner.$options?.name === "Works" && typeof owner.$options.methods?.makeMainRequest === "function" && typeof owner.requestWorksQueue === "function" && typeof owner.$axios?.CancelToken?.source === "function") return owner;
      }
    }
    return null;
  }
  var soloWorksFeature = {
    name: "solo works",
    init(vm) {
      GM_addStyle(`
      .row.aop-solo-toolbar { justify-content: flex-start; align-items: center; gap: 6px 10px; }
      .aop-solo-toolbar > :last-child { margin-inline-start: auto; }
      .aop-solo-works { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        min-height: 36px; padding: 0 12px; border: 1px solid rgba(0, 0, 0, .24); border-radius: 20px;
        background: transparent; color: inherit; font: inherit; white-space: nowrap; cursor: pointer; }
      .body--dark .aop-solo-works { border-color: rgba(255, 255, 255, .4); }
      .aop-solo-works .material-icons { font-size: 18px; }
      .aop-solo-works:hover { background: rgba(127, 127, 127, .1); }
      .aop-solo-works[aria-pressed="true"] { color: var(--q-color-primary, #1976d2); border-color: currentColor;
        background: rgba(25, 118, 210, .1); }
      .body--dark .aop-solo-works[aria-pressed="true"] { color: #90caf9; }
      .aop-solo-works:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .aop-solo-indexing h1.text-h5 + span,
      .aop-solo-indexing .q-page > .q-mt-lg.q-mb-xl.text-center,
      .aop-solo-indexing .q-page > .q-pt-lg.q-pb-md.flex-center { display: none !important; }
    `);
      const doc = pageWindow.document;
      const bindings = new WeakMap();
      let mountedToolbar;
      let indexingRoot;
      const label = el("span");
      const loading = el("span", { class: "text-caption", role: "status" });
      const control = el("button", { type: "button", class: "aop-solo-works", onkeydown: (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }, onclick: () => {
        const route = vm.$route;
        if (route.path !== "/works" || !mountedToolbar) return;
        const query = { ...route.query };
        delete query.page;
        if (query[SOLO_QUERY] === "1") delete query[SOLO_QUERY];
        else query[SOLO_QUERY] = "1";
        vm.$router.push({ path: route.path, query, hash: route.hash }).catch(() => {
        });
      } }, [el("i", { class: "material-icons", "aria-hidden": "true" }, "person"), label]);
      const ensure = () => {
        const route = vm.$route;
        const heading = route?.path === "/works" && doc.querySelector(".q-page-container h1.text-h5");
        const owner = heading && worksOwner(heading);
        let state;
        if (owner && hasSingleActor(owner)) {
          if (!bindings.has(owner)) bindings.set(owner, bindWorks(owner, schedule));
          state = bindings.get(owner);
        }
        const enabled = Boolean(state && soloEnabled(owner));
        const toolbar = state && heading.parentElement.nextElementSibling?.querySelector(".q-page > .row.justify-between");
        if (toolbar !== mountedToolbar) {
          mountedToolbar?.classList.remove("aop-solo-toolbar");
          mountedToolbar = toolbar || null;
        }
        if (toolbar?.firstElementChild) {
          toolbar.classList.add("aop-solo-toolbar");
          if (toolbar.firstElementChild.nextElementSibling !== control) toolbar.firstElementChild.after(control);
          control.setAttribute("aria-pressed", String(enabled));
          const text = tr("soloWorksOnly");
          if (label.textContent !== text) label.textContent = text;
        } else {
          control.remove();
        }
        const indexing = Boolean(enabled && state.index && !state.index.ready);
        const root = indexing ? owner.$el : null;
        if (root !== indexingRoot) {
          indexingRoot?.classList.remove("aop-solo-indexing");
          indexingRoot = root;
          indexingRoot?.classList.add("aop-solo-indexing");
        }
        if (toolbar?.firstElementChild && indexing) {
          const text = tr(owner.works.length ? "soloWorksLoadingPages" : "soloWorksLoading");
          if (loading.textContent !== text) loading.textContent = text;
          if (control.nextElementSibling !== loading) control.after(loading);
        } else loading.remove();
      };
      let scheduled = false;
      const schedule = () => {
        if (scheduled || !mountedToolbar && vm.$route?.path !== "/works") return;
        scheduled = true;
        pageWindow.requestAnimationFrame(() => {
          scheduled = false;
          try {
            ensure();
          } catch (err) {
            console.error(LOG_PREFIX, "单人出演筛选", err);
          }
        });
      };
      new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
      vm.$watch(() => vm.$route, schedule);
      onLocaleChange(schedule);
      schedule();
    }
  };
  async function clearSoloWorksCache() {
    sharedIndex?.source.cancel("Solo cache cleared");
    sharedIndex = null;
    await clearSoloCache();
  }
  /*! 数据管理独立页面：备份的唯一界面入口，并提供全部进度/全部脚本数据的清除操作。 */
  var DATA_PATH = "/script-data";
  var dataManagementFeature = {
    name: "data-management",
    init(vm) {
      this.vm = vm;
      GM_addStyle(`
      .aop-data-card { overflow: visible; }
      .aop-data-row { display: flex; align-items: center; justify-content: space-between; gap: 20px;
        padding: 20px; border-bottom: 1px solid rgba(128,128,128,.2); }
      .aop-data-row:last-child { border-bottom: none; }
      .aop-data-hint { margin: 0; font-size: 14px; line-height: 1.6; }
      .aop-data-actions { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 12px; max-width: 100%; }
      .aop-data-actions .aop-backup-menu { left: auto; right: 0; max-width: calc(100vw - 56px); }
      .aop-data-actions .aop-data-button { display: flex; align-items: center; justify-content: center;
        box-sizing: border-box; width: 180px; max-width: 100%; min-height: 36px; padding: 6px 14px;
        font-size: 13px; line-height: 22px; background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.5); }
      .aop-data-actions .aop-data-danger { color: #c10015; border-color: currentColor; }
      .body--dark .aop-data-actions .aop-data-danger { color: #ff8a80; }
      .aop-data-actions .aop-data-button:hover { background: rgba(128,128,128,.1); }
      .aop-data-actions .aop-data-button:focus-visible { outline: 2px solid #1976d2; outline-offset: 2px; }
      @media (max-width: 700px) {
        .aop-data-row { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; }
        .aop-data-actions .aop-backup-menu { left: 0; right: auto; }
      }
    `);
      const hasPage = addPage(vm, {
        path: DATA_PATH,
        title: () => `${tr("dataManagement")} - ASMR Online`,
        renderInto: (container) => this.mountLive(container)
      });
      if (!hasPage) return;
      addNavItem({
        id: "data",
        label: () => tr("dataManagement"),
        iconSvg: ICONS.data,
        href: DATA_PATH,
        onClick: () => vm.$router.push(DATA_PATH).catch(() => {
        }),
        isActive: () => vm.$route?.path === DATA_PATH,
        after: '[data-aop-nav="history"]'
      });
    },
    mountLive(container) {
      this.renderInto(container);
      return onLocaleChange(() => this.renderInto(container));
    },
    renderInto(container) {
      const row = (hint, actions) => el("div", { class: "aop-data-row" }, [
        el("p", { class: "aop-data-hint" }, hint),
        el("div", { class: "aop-data-actions" }, actions)
      ]);
      container.replaceChildren(
        el("div", { class: "aop-head" }, el("h1", {}, tr("dataManagement"))),
        el("section", { class: "aop-card aop-data-card", "data-aop-data": "" }, [
          row(tr("backupHint"), backupFeature.buttons(this.vm)),
          row(tr("clearProgressHint"), el("button", {
            type: "button",
            class: "aop-btn aop-data-button",
            onclick: () => progressActions.clearAll(this.vm)
          }, tr("clearProgress"))),
          row(tr("clearAllHint"), el("button", {
            type: "button",
            class: "aop-btn aop-data-button aop-data-danger",
            onclick: async () => {
              if (!pageWindow.confirm(tr("clearAllConfirm"))) return;
              historyStore.clear();
              progressStore.clearAll();
              favoritesStore.clear();
              await clearSoloWorksCache();
              pageWindow.location.reload();
            }
          }, tr("clearAllMenu")))
        ])
      );
    }
  };
  /*! 声优/标签/社团目录缓存：按 API 地址和类型隔离，合并并发请求，供数量显示和实体识别共用。 */
  function entityNames(item) {
    return [...new Set([item.name, ...Object.values(item.i18n || {}).map((translation) => translation && translation.name)].filter(Boolean))];
  }
  function workCount(item) {
    const value = item && item.count;
    if (value == null || typeof value === "string" && !value.trim() || typeof value !== "number" && typeof value !== "string") return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
  }
  function sortByWorkCount(items, countOf = workCount) {
    return items.map((item, index) => ({ item, index, count: countOf(item) })).sort((a, b) => (b.count == null ? -1 : b.count) - (a.count == null ? -1 : a.count) || a.index - b.index).map(({ item }) => item);
  }
  var COUNT_REFRESH_MS = 5 * 60 * 1e3;
  var entityCatalog = {
    entries: new Map(),
    pending: new Map(),
    listeners: new Set(),
    key(vm, type) {
      return `${getApiBase(vm)}:${type}`;
    },
    get(vm, type) {
      return this.entries.get(this.key(vm, type));
    },
    ingest(vm, type, rows) {
      if (!Array.isArray(rows)) throw new Error("目录数据格式不正确");
      const key = this.key(vm, type);
      if (this.entries.get(key)?.source === rows) return;
      const items = rows.map((row) => ({ id: `site:${row.id}`, siteId: row.id, name: row.name, i18n: row.i18n, aliases: entityNames(row), count: workCount(row) }));
      const byId = new Map(items.map((item) => [String(item.siteId), item]));
      const byName = new Map();
      for (const item of items) for (const name of item.aliases) {
        if (!byName.has(name)) byName.set(name, item);
        else if (byName.get(name)?.siteId !== item.siteId) byName.set(name, null);
      }
      this.entries.set(key, { source: rows, items, byId, byName, updatedAt: Date.now() });
      for (const fn of this.listeners) fn(type);
    },
    find(vm, type, item) {
      const entry = this.get(vm, type);
      if (!entry) return void 0;
      if (item.siteId != null) return entry.byId.get(String(item.siteId));
      return favoriteNames(item).map((name) => entry.byName.get(name)).find(Boolean);
    },
    count(vm, type, item) {
      return this.find(vm, type, item)?.count ?? null;
    },
    async load(vm, type, force = false) {
      const key = this.key(vm, type);
      const cached = this.get(vm, type);
      if (!force && cached && Date.now() - cached.updatedAt < COUNT_REFRESH_MS) return;
      if (this.pending.has(key)) return this.pending.get(key);
      const request = apiGet(vm, `${type === "va" ? "vas" : type === "tag" ? "tags" : "circles"}/`, { fresh: true }).then((rows) => this.ingest(vm, type, rows)).finally(() => this.pending.delete(key));
      this.pending.set(key, request);
      return request;
    },
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
  };
  /*! 我的关注页面：负责分组操作和按作品数量展示；页面级刷新定时器、订阅在退出时释放。 */
  var FAVORITES_PATH = "/favorites";
  var favoritesView = {
    tab: "va",
    countErrors: {},
    watchCounts(container) {
      const refresh = (force = false) => {
        if (container.isConnected && pageWindow.document.visibilityState !== "hidden") return this.loadCounts(this.tab, force);
      };
      const timer = setInterval(() => refresh(true), COUNT_REFRESH_MS);
      const onReturn = () => refresh();
      pageWindow.addEventListener("focus", onReturn);
      pageWindow.document.addEventListener("visibilitychange", onReturn);
      return () => {
        clearInterval(timer);
        pageWindow.removeEventListener("focus", onReturn);
        pageWindow.document.removeEventListener("visibilitychange", onReturn);
      };
    },
    loadCounts(type, force = false) {
      delete this.countErrors[type];
      const request = entityCatalog.load(this.vm, type, force);
      this.renderInto(this.container);
      return request.catch(() => {
        this.countErrors[type] = true;
      }).finally(() => {
        if (this.container && this.container.isConnected) this.renderInto(this.container);
      });
    },
    mount(vm) {
      GM_addStyle(`
      .aop-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid rgba(128,128,128,.25); }
      .aop-tab { border: none; background: none; padding: 10px 16px; font-size: 14px; cursor: pointer; color: #888;
        border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .aop-tab.aop-on { color: #673ab7; border-bottom-color: #673ab7; font-weight: 500; }
      .aop-chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .aop-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px 6px 14px; border-radius: 16px;
        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); font-size: 14px; }
      .body--dark .aop-chip { background: #1d1d1d; }
      .aop-chip-name { cursor: pointer; }
      .aop-chip-name:hover { color: #673ab7; }
      .aop-chip-x { border: none; background: none; color: #aaa; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
      .aop-chip-x:hover { color: #c10015; }
      .aop-work-count { color: #00897b; font-size: 12px; white-space: nowrap; }
      .body--dark .aop-work-count { color: #80cbc4; }
      .aop-refresh { margin-left: auto; align-self: center; border: none; background: none; color: #aaa; cursor: pointer;
        font-size: 16px; line-height: 1; padding: 6px 8px; border-radius: 50%; }
      .aop-refresh:hover { color: #673ab7; background: rgba(128,128,128,.1); }
      .aop-refresh.aop-loading { cursor: default; animation: aop-spin 1s linear infinite; }
      @keyframes aop-spin { to { transform: rotate(360deg); } }
      .aop-count-error { color: #c10015; font-size: 13px; margin: -8px 0 12px; }
      .aop-group { margin-bottom: 18px; padding: 12px 14px 14px; border-radius: 6px; border: 1px dashed transparent;
        background: rgba(128,128,128,.06); }
      .aop-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .aop-group-name { font-size: 16px; font-weight: 500; }
      .aop-group-count { color: #888; font-size: 13px; }
      .aop-group-tools { margin-left: auto; display: flex; gap: 4px; }
      .aop-group-tools button, .aop-add-group { border: none; background: none; color: #888; cursor: pointer; font-size: 13px; padding: 2px 6px; }
      .aop-group-tools button:hover, .aop-add-group:hover { color: #673ab7; }
      .aop-group-empty { color: #999; font-size: 13px; padding: 4px 0; }
      .aop-chip-move { appearance: none; -webkit-appearance: none; border: none; box-shadow: none; color: transparent; text-shadow: none;
        background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23999' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat center / 12px 12px;
        font-size: 12px; cursor: pointer; width: 22px; min-width: 22px; max-width: 22px; flex: 0 0 22px; padding: 0;
        opacity: 0; transition: opacity .15s; }
      .aop-chip:hover .aop-chip-move, .aop-chip:focus-within .aop-chip-move { opacity: 1; }
      @media (hover: none), (pointer: coarse) { .aop-chip-move { opacity: 1; } }
      .aop-chip-move option { background: #fff; color: #222; }
      .body--dark .aop-chip-move { color-scheme: dark; }
      .body--dark .aop-chip-move option { background: #1d1d1d; color: #eee; }
    `);
      this.vm = vm;
      try {
        this.tab = storage.get("favorites-tab", "va");
      } catch (err) {
        this.tab = "va";
      }
      const hasPage = addPage(vm, { path: FAVORITES_PATH, title: () => `${tr("following")} - ASMR Online`, renderInto: (container) => this.mountLive(container) });
      if (!hasPage) return;
      const open = () => vm.$router.push(FAVORITES_PATH).catch(() => {
      });
      addNavItem({
        id: "favorites",
        label: () => tr("following"),
        iconSvg: ICONS.star,
        href: FAVORITES_PATH,
        onClick: open,
        isActive: () => vm.$route && vm.$route.path === FAVORITES_PATH,
        after: "/playlists"
      });
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(tr("following"), open);
    },
    mountLive(container) {
      this.renderInto(container);
      const stopFavorites = favoritesStore.onChange(() => this.renderInto(container));
      const stopCounts = entityCatalog.onChange(() => this.renderInto(container));
      const stopLocale = onLocaleChange(() => this.renderInto(container));
      const stopRefresh = this.watchCounts(container);
      this.loadCounts(this.tab);
      return () => {
        stopFavorites();
        stopCounts();
        stopLocale();
        stopRefresh();
        if (this.container === container) this.container = null;
      };
    },
    renderInto(container) {
      const vm = this.vm;
      this.container = container;
      const data = favoritesStore.all();
      if (!Object.hasOwn(FAVORITE_TYPES, this.tab)) this.tab = "va";
      const tabs = el("div", { class: "aop-tabs" }, Object.keys(FAVORITE_TYPES).map((type2) => el("button", {
        class: `aop-tab${type2 === this.tab ? " aop-on" : ""}`,
        "data-tab": type2,
        onclick: () => {
          this.tab = type2;
          storage.set("favorites-tab", type2);
          this.renderInto(container);
          this.loadCounts(type2);
        }
      }, tr("tab", typeLabel(type2), data[type2].length))));
      const type = this.tab;
      const items = sortByWorkCount(data[type], (item) => entityCatalog.count(vm, type, item));
      const groups = data.groups[type];
      const loading = entityCatalog.pending.has(entityCatalog.key(vm, type));
      const updatedAt = entityCatalog.get(vm, type)?.updatedAt;
      const refreshTitle = loading ? tr("loadingCounts") : tr("refreshCounts", updatedAt ? new Date(updatedAt).toLocaleTimeString(LOCALE_INFO[currentLocale()].tag, { hour: "2-digit", minute: "2-digit" }) : null);
      tabs.append(el("button", {
        class: `aop-refresh${loading ? " aop-loading" : ""}`,
        "data-aop-refresh": "",
        title: refreshTitle,
        "aria-label": refreshTitle,
        ...loading ? { disabled: "" } : {},
        onclick: () => this.loadCounts(type, true)
      }, "↻"));
      const countError = this.countErrors[type] ? el("div", { class: "aop-count-error", role: "status" }, tr("countError")) : null;
      const emptyHint = items.length ? null : tr("followHint", typeNoun(type));
      const body = el("div", {}, groups.map((group) => this.renderGroup(type, group, items.filter((item) => item.group === group), emptyHint)));
      const addGroup = el("button", {
        class: "aop-add-group",
        onclick: () => {
          const name = pageWindow.prompt(tr("newGroupPrompt"));
          if (name && !favoritesStore.addGroup(type, name)) notify(vm, tr("groupNameInvalid"));
        }
      }, tr("newGroup"));
      container.replaceChildren(
        el("div", { class: "aop-head" }, [el("h1", {}, tr("following"))]),
        tabs,
        ...countError ? [countError] : [],
        body,
        addGroup
      );
    },
    renderGroup(type, group, items, emptyHint = null) {
      const vm = this.vm;
      const isInbox = group === FAVORITE_TYPES[type].inbox;
      const tools = [
        el("button", {
          title: tr("addTitle"),
          onclick: () => {
            const text = pageWindow.prompt(tr("addPrompt", groupName(type, group), typeNoun(type)));
            if (!text) return;
            for (const name of text.split(/[;；]+/).map((x) => x.trim()).filter(Boolean)) {
              if (favoritesStore.has(type, name)) favoritesStore.move(type, name, group);
              else favoritesStore.add(type, { id: name, name, group }, { append: true });
            }
          }
        }, tr("add"))
      ];
      if (items.length) {
        tools.push(el("button", {
          "data-aop-clear-group": "",
          onclick: () => {
            if (pageWindow.confirm(tr("confirmClearGroup", groupName(type, group), items.length, typeNoun(type)))) favoritesStore.clearGroup(type, group);
          }
        }, tr("clearGroup")));
      }
      if (!isInbox) {
        tools.push(
          el("button", {
            onclick: () => {
              const name = pageWindow.prompt(tr("renamePrompt"), group);
              if (name && name !== group && !favoritesStore.renameGroup(type, group, name)) notify(vm, tr("groupNameInvalid"));
            }
          }, tr("rename")),
          el("button", {
            onclick: () => {
              if (pageWindow.confirm(tr("confirmDeleteGroup", group, items.length, tr("inbox")))) {
                favoritesStore.removeGroup(type, group);
              }
            }
          }, tr("deleteGroup"))
        );
      }
      const allGroups = favoritesStore.groups(type);
      const chips = items.map((item) => {
        const move = el("select", {
          class: "aop-chip-move",
          title: tr("moveToGroup"),
          onchange: (event) => favoritesStore.move(type, item.id, event.target.value)
        }, allGroups.map((g) => {
          const option = el("option", { value: g }, groupName(type, g));
          if (g === group) option.selected = true;
          return option;
        }));
        const entry = entityCatalog.find(vm, type, item);
        const count = entry ? entry.count : null;
        return el("span", {
          class: "aop-chip",
          "data-id": String(item.id)
        }, [
          el("span", { class: "aop-chip-name", onclick: () => vm.$router.push(keywordRoute(type, item.name)).catch(() => {
          }) }, localizedEntityName(entry, item.name)),
          el("span", { class: "aop-work-count" }, count == null ? tr("unknown") : tr("works", count)),
          move,
          el("button", { class: "aop-chip-x", title: tr("unfollow"), onclick: () => favoritesStore.remove(type, item.id) }, "×")
        ]);
      });
      return el("div", {
        class: "aop-group",
        "data-group": group
      }, [
        el("div", { class: "aop-group-head" }, [
          el("span", { class: "aop-group-name" }, groupName(type, group)),
          el("span", { class: "aop-group-count" }, String(items.length)),
          el("div", { class: "aop-group-tools" }, tools)
        ]),
        items.length ? el("div", { class: "aop-chips" }, chips) : isInbox && emptyHint ? el("div", { class: "aop-group-empty" }, emptyHint) : null
      ]);
    }
  };
  /*! 网站页面关注入口：向作品元数据、目录和搜索菜单补充星标；实体识别与存储交给 catalog/store。 */
  var favoriteButtons = {
    mount(vm) {
      GM_addStyle(`
      .aop-star { display: inline-flex; align-items: center; justify-content: center; border: none; background: none;
        cursor: pointer; padding: 0 2px; margin: 0 6px 0 -2px; font-size: 18px; line-height: 1; color: #bbb;
        vertical-align: middle; }
      .aop-star:hover { color: #ffb300; }
      .aop-star.aop-on { color: #ffb300; }
      .aop-star.aop-directory-star { width: 22px; height: 22px; padding: 0; margin: 0 0 0 6px; vertical-align: middle; }
      .aop-directory-star:not(.aop-on) { opacity: 0; }
      .aop-directory-entry:hover .aop-directory-star,
      .aop-directory-entry:focus-within .aop-directory-star { opacity: 1; }
      @media (hover: none), (pointer: coarse) { .aop-star.aop-directory-star { opacity: 1; } }
      .aop-search-star { font-size: 24px; margin-left: 4px; }
      .aop-meta-anchor { position: relative; }
      .aop-star.aop-floating-star { position: absolute; top: -2px; right: -2px; z-index: 1;
        width: 21px; height: 21px; padding: 0; margin: 0; border-radius: 50%;
        background: #fff; color: #b77900; box-shadow: 0 1px 3px rgba(0,0,0,.2);
        font-size: 16px; line-height: 1; opacity: 0; pointer-events: none; transition: opacity .12s; }
      .aop-star.aop-floating-star.aop-on { color: #ffb300; }
      .body--dark .aop-star.aop-floating-star { background: #2d2d2d; color: #ffc44b; }
      .aop-meta-anchor:hover > .aop-floating-star,
      .aop-meta-anchor:focus-within > .aop-floating-star,
      .aop-star.aop-floating-star.aop-on { opacity: 1; pointer-events: auto; }
      @media (hover: none), (pointer: coarse) {
        .aop-star.aop-floating-star { width: 24px; height: 24px; opacity: 1; pointer-events: auto; }
      }
      @media (prefers-reduced-motion: reduce) { .aop-star.aop-floating-star { transition: none; } }
      .aop-follow-menu-item { appearance: none; width: 100%; border: 0; text-align: left;
        font: inherit; color: inherit; background: transparent; }
      .aop-follow-menu-item .q-item__section--avatar { min-width: 36px; }
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
            console.error(LOG_PREFIX, "关注按钮", err);
          }
        });
      };
      new MutationObserver(run).observe(pageWindow.document.body, { childList: true, subtree: true, characterData: true });
      favoritesStore.onChange(run);
      onLocaleChange(run);
      run();
    },
    ensure() {
      const route = this.vm.$route || {};
      const page = pageWindow.document.querySelector(".q-page-container");
      if (page) {
        if (/^\/work\//.test(route.path || "")) this.ensureFloatingStars(page);
        directoryView.ensure(this.vm, page, route);
        this.ensureSearchStar(page, route);
      }
      this.ensureMenus();
      this.syncStars();
    },
    star(type, item, extraClass = "") {
      const button = el("button", {
        type: "button",
        class: `aop-star ${extraClass}`.trim(),
        "data-aop-star": type,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          let current = button.aopItem;
          let currentType = button.dataset.aopStar;
          if (button.aopAnchor) {
            const anchor = button.aopAnchor;
            const props = componentProps(anchor, (p) => FAVORITE_TYPES[p.searchType]);
            if (!anchor.isConnected || !props || !props.searchContent) return;
            currentType = props.searchType;
            current = this.item(currentType, props.searchContent, anchor);
            favoritesStore.reconcile(currentType, current);
            button.aopItem = current;
            button.dataset.aopStar = currentType;
          }
          const on = favoritesStore.toggle(currentType, current);
          this.syncStars();
          notify(this.vm, tr("followed", on, current.name));
        }
      });
      button.aopItem = item;
      return button;
    },
    syncStars() {
      const lists = {};
      for (const button of pageWindow.document.querySelectorAll("[data-aop-star]")) {
        const type = button.dataset.aopStar;
        lists[type] = lists[type] || favoritesStore.list(type) || [];
        const on = lists[type].some((item) => sameFavorite(item, button.aopItem));
        const label = tr("starLabel", on, button.aopItem.name);
        if (button.classList.contains("aop-on") === on && button.dataset.aopSynced && button.getAttribute("aria-label") === label) continue;
        button.dataset.aopSynced = "1";
        button.classList.toggle("aop-on", on);
        button.title = on ? tr("unfollow") : tr("follow");
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(on));
        button.textContent = on ? "★" : "☆";
      }
    },
    reconcile(type, item) {
      if (this.reconciledVersion !== favoritesStore.version) {
        this.reconciled = new Set();
        this.reconciledVersion = favoritesStore.version;
      }
      const key = JSON.stringify([type, item.name, item.siteId ?? null, item.aliases || []]);
      if (this.reconciled.has(key)) return;
      this.reconciled.add(key);
      favoritesStore.reconcile(type, item);
    },
    item(type, name, anchor) {
      const item = favoriteItem(findMetadata(anchor), type, name);
      if (item.siteId != null) return item;
      let entry;
      if (DIRECTORY_TYPES[this.vm.$route?.path] === type) {
        for (let comp = anchor.__vue__; comp && comp.$el === anchor; comp = comp.$parent) {
          if (comp.$vnode?.key != null) entry = entityCatalog.get(this.vm, type)?.byId.get(String(comp.$vnode.key));
          if (entry) break;
        }
      }
      entry = entry || entityCatalog.find(this.vm, type, item);
      return entry ? { ...item, id: entry.id, siteId: entry.siteId, aliases: entry.aliases } : item;
    },
    ensureFloatingStars(page) {
      for (const button of page.querySelectorAll(".aop-floating-star")) {
        const anchor = button.aopAnchor;
        const props = anchor && componentProps(anchor, (p) => FAVORITE_TYPES[p.searchType]);
        if (!props || !props.searchContent || button.parentElement !== anchor) {
          button.remove();
          if (anchor && anchor.classList.contains("aop-meta-anchor")) anchor.classList.toggle("aop-meta-anchor", false);
        }
      }
      for (const node of page.querySelectorAll("*")) {
        const props = componentProps(node, (p) => FAVORITE_TYPES[p.searchType]);
        if (!props || !props.searchContent) continue;
        const type = props.searchType;
        const item = this.item(type, props.searchContent, node);
        this.reconcile(type, item);
        if (!node.classList.contains("aop-meta-anchor")) node.classList.toggle("aop-meta-anchor", true);
        let button = [...node.querySelectorAll(".aop-floating-star")].find((child) => child.parentElement === node);
        if (!button) {
          button = this.star(type, item, "aop-floating-star");
          node.append(button);
        }
        button.aopAnchor = node;
        button.aopItem = item;
        button.dataset.aopStar = type;
      }
    },
    ensureMenus() {
      for (const menu of pageWindow.document.querySelectorAll(".q-menu")) {
        const context = searchMenuContext(menu);
        const list = menu.querySelector(".q-list");
        if (!context || !list) {
          for (const old of menu.querySelectorAll("[data-aop-follow-menu]")) old.remove();
          continue;
        }
        const { searchType: type, searchContent: name } = context.owner.$props;
        const item = this.item(type, name, context.owner.$el);
        this.reconcile(type, item);
        let action = list.querySelector("[data-aop-follow-menu]");
        if (!action) {
          action = el("button", {
            type: "button",
            role: "menuitem",
            "data-aop-follow-menu": type,
            class: "q-item q-item-type row no-wrap q-item--clickable q-link cursor-pointer q-focusable q-hoverable aop-follow-menu-item",
            onclick: (event) => {
              event.preventDefault();
              const current = searchMenuContext(menu);
              if (!current) return;
              const props = current.owner.$props;
              const target = this.item(props.searchType, props.searchContent, current.owner.$el);
              favoritesStore.reconcile(props.searchType, target);
              const on2 = favoritesStore.toggle(props.searchType, target);
              notify(this.vm, tr("followed", on2, target.name));
              if (typeof current.controller.hide === "function") {
                event.stopPropagation();
                current.controller.hide(event);
              }
            }
          }, [
            el("span", { class: "q-item__section column q-item__section--avatar q-item__section--side justify-center" }, el("i", { class: "q-icon material-icons aop-follow-menu-icon", "aria-hidden": "true" })),
            el("span", { class: "q-item__section column q-item__section--main justify-center aop-follow-menu-label" })
          ]);
          list.append(action);
        }
        action.aopItem = item;
        action.dataset.aopFollowMenu = type;
        const on = favoritesStore.has(type, item);
        const label = tr("followMenu", on, typeNoun(type));
        const icon = action.querySelector(".aop-follow-menu-icon");
        const text = action.querySelector(".aop-follow-menu-label");
        if (icon.textContent !== (on ? "star" : "star_border")) icon.textContent = on ? "star" : "star_border";
        if (text.textContent !== label) text.textContent = label;
        action.setAttribute("aria-label", `${label}${currentLocale() === "en" ? ": " : "："}${name}`);
      }
    },
    ensureSearchStar(page, route) {
      const keyword = route.path === "/works" && route.query && route.query.keyword;
      const match = typeof keyword === "string" && keyword.trim().match(/^\$(va|tag|circle):([^$]+)\$$/);
      const existing = page.querySelector(".aop-search-star");
      const key = match ? `${match[1]}:${match[2]}` : null;
      if (existing && existing.dataset.key === key) return;
      if (existing) existing.remove();
      if (!match) return;
      const chip = page.querySelector("h1.text-h5 > span.inline-block");
      if (!chip) return;
      const [, type, name] = match;
      const star = this.star(type, { id: name, name }, "aop-search-star");
      star.dataset.key = key;
      chip.after(star);
    }
  };
  var DIRECTORY_TYPES = { "/vas": "va", "/tags": "tag", "/circles": "circle" };
  var directoryView = {
    bindings: new WeakMap(),
    owner(page, type) {
      const seen = new Set();
      for (const node of [page, ...page.querySelectorAll("*")]) {
        for (let comp = node.__vue__; comp && !seen.has(comp); comp = comp.$parent) {
          seen.add(comp);
          const restrict = comp.$props && comp.$props.restrict;
          if (DIRECTORY_TYPES[`/${restrict}`] === type && Array.isArray(comp.items)) return comp;
        }
      }
      return null;
    },
    ensure(vm, page, route) {
      const type = DIRECTORY_TYPES[route.path];
      if (!type) return;
      const owner = this.owner(page, type);
      const viewport = page.querySelector(".q-virtual-scroll");
      if (!owner || !viewport) return;
      let state = this.bindings.get(owner);
      if (!state) {
        state = { type, source: null };
        this.bindings.set(owner, state);
      }
      if (state.type !== type) {
        state.waiting = owner.items === state.source;
        state.oldSource = owner.items;
        state.type = type;
        state.sortedSource = null;
      }
      if (state.waiting && owner.items === state.oldSource) {
        for (const star of page.querySelectorAll(".aop-directory-star")) star.remove();
        return;
      }
      state.waiting = false;
      if (state.sortedSource !== owner.items) {
        const ordered = sortByWorkCount(owner.items);
        if (ordered.some((item, index) => item !== owner.items[index])) {
          owner.items = ordered;
          viewport.scrollTop = 0;
        }
        state.sortedSource = owner.items;
      }
      state.source = owner.items;
      if (owner.items.length) entityCatalog.ingest(vm, type, owner.items);
      for (const node of page.querySelectorAll("*")) {
        const props = componentProps(node, (p) => p.searchType === type && p.searchContent);
        if (!props) continue;
        const label = node.querySelector(".q-item__label");
        if (!label) continue;
        const item = favoriteButtons.item(type, props.searchContent, node);
        favoriteButtons.reconcile(type, item);
        let star = label.querySelector(".aop-directory-star");
        if (!star) {
          star = favoriteButtons.star(type, item, "aop-directory-star");
          label.append(star);
        }
        star.aopAnchor = node;
        star.aopItem = item;
        star.dataset.aopStar = type;
        if (!node.classList.contains("aop-directory-entry")) node.classList.toggle("aop-directory-entry", true);
      }
    }
  };
  function searchMenuContext(menu) {
    for (const node of [menu, ...menu.querySelectorAll("*")]) {
      let controller = null;
      for (let comp = node.__vue__; comp; comp = comp.$parent) {
        if (comp.$options && comp.$options.name === "QMenu") controller = comp;
        const props = comp.$props;
        if (controller && props && FAVORITE_TYPES[props.searchType] && typeof props.searchContent === "string" && props.searchContent) {
          if (comp._isDestroyed || !comp.$el || !comp.$el.isConnected) return null;
          return { owner: comp, controller };
        }
      }
    }
    return null;
  }
  function componentProps(node, test) {
    for (let comp = node.__vue__; comp && comp.$el === node; comp = comp.$parent) {
      if (comp.$props && test(comp.$props)) return comp.$props;
    }
    return null;
  }
  function findMetadata(node) {
    for (let n = node; n; n = n.parentElement) {
      const props = componentProps(n, (p) => p.metadata);
      if (props) return props.metadata;
    }
    return null;
  }
  function favoriteItem(metadata, type, name) {
    const list = !metadata ? [] : type === "circle" ? [metadata.circle].filter(Boolean) : metadata[type === "va" ? "vas" : "tags"] || [];
    const found = list.find((entry) => entityNames(entry).includes(name));
    return { id: found && found.id != null ? `site:${found.id}` : name, name, ...found ? { siteId: found.id, aliases: entityNames(found) } : {} };
  }
  var favoritesFeature = {
    name: "favorites",
    init(vm) {
      storage.remove("favorites-sort");
      storage.remove("directory-sort");
      favoritesView.mount(vm);
      favoriteButtons.mount(vm);
    }
  };
  /*! 原站收藏夹移出确认：捕获阶段拦住原点击，确认后只向仍存在的作品卡片发送一次 delete。 */
  function playlistRemoveButton(node) {
    for (let n = node; n && n.classList; n = n.parentElement) {
      if (!n.classList.contains("like-btn")) continue;
      const icon = n.querySelector(".q-icon");
      return icon && icon.textContent.trim() === "playlist_remove" ? n : null;
    }
    return null;
  }
  function playlistRemoveCard(button) {
    for (const node of [button, ...button.querySelectorAll("*")]) {
      for (let comp = node.__vue__; comp; comp = comp.$parent) {
        if (comp.$props && "showDeleteBtn" in comp.$props) return comp;
      }
    }
    return null;
  }
  var playlistRemoveGuard = {
    vm: null,
    confirm(message, onOk) {
      const q = this.vm && this.vm.$q;
      if (q && typeof q.dialog === "function") {
        q.dialog({
          title: tr("playlistRemoveTitle"),
          message,
          cancel: { label: tr("cancel"), flat: true },
          ok: { label: tr("playlistRemoveOk"), color: "negative", flat: true },
          focus: "cancel"
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
      this.confirm(tr("playlistRemoveConfirm", metadata && metadata.source_id), () => {
        if (!card._isDestroyed) card.$emit("delete");
      });
    },
    label(root = pageWindow.document) {
      const hint = tr("playlistRemoveHint");
      for (const node of root.querySelectorAll(".like-btn")) {
        if (playlistRemoveButton(node) !== node) continue;
        if (node.getAttribute("title") !== hint) node.setAttribute("title", hint);
        if (node.getAttribute("aria-label") !== hint) node.setAttribute("aria-label", hint);
      }
    }
  };
  var playlistRemoveFeature = {
    name: "playlist-remove-guard",
    init(vm) {
      playlistRemoveGuard.vm = vm;
      pageWindow.document.addEventListener("click", (event) => playlistRemoveGuard.onClick(event), true);
      const label = () => playlistRemoveGuard.label();
      label();
      new MutationObserver(label).observe(pageWindow.document.body, { childList: true, subtree: true });
      onLocaleChange(label);
    }
  };
  /*! 为原站播放器按钮补充原生悬停提示和无障碍名称；仅识别 AudioPlayer/AudioPlayerClassic 内的按钮。 */
  var PLAY_MODE_ICONS = new Set(["playlist_play", "repeat", "repeat_one", "shuffle"]);
  function playerButtonContext(button) {
    let icon = null;
    for (let component = button.__vue__; component; component = component.$parent) {
      if (component._isDestroyed) return null;
      if (component.$el === button && typeof component.$props?.icon === "string") icon = component.$props.icon;
      if (["AudioPlayer", "AudioPlayerClassic"].includes(component.$options?.name)) {
        return { player: component, icon: icon || button.querySelector(".q-icon")?.textContent.trim() };
      }
    }
    return null;
  }
  var playerHintsFeature = {
    name: "player-hints",
    label(button) {
      const context = playerButtonContext(button);
      if (!context) return null;
      const { player, icon } = context;
      if (icon === "queue_music") return tr("playerQueue");
      if (PLAY_MODE_ICONS.has(icon)) {
        const mode = player.playMode?.name || this.vm.$store.state.AudioPlayer.playMode?.name || "order";
        const names = tr("playerModeNames");
        return tr("playerModeHint", names[mode] || names.order);
      }
      if (icon === "picture_in_picture_alt") {
        const mode = player.subtitleDisplayMode || this.vm.$store.state.AudioPlayer.subtitleDisplayMode;
        return tr(mode === "pip" ? "playerInlineSubtitles" : "playerDesktopSubtitles");
      }
      if (icon === "subtitles") {
        const track = player.currentPlayingFile || currentTrack(this.vm.$store.state);
        return tr(track?.availableLyrics?.length ? "playerSelectSubtitles" : "playerLoadSubtitles");
      }
      if (icon === "more_horiz") return tr("playerMoreActions");
      return null;
    },
    update(button) {
      const label = this.label(button);
      if (!label) return;
      if (button.getAttribute("title") !== label) button.setAttribute("title", label);
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    },
    init(vm) {
      this.vm = vm;
      const doc = pageWindow.document;
      const ensure = () => {
        for (const button of doc.querySelectorAll(".q-btn")) this.update(button);
      };
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        pageWindow.requestAnimationFrame(() => {
          scheduled = false;
          ensure();
        });
      };
      new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true, characterData: true });
      vm.$store.subscribe((mutation) => {
        if (["AudioPlayer/CHANGE_PLAY_MODE", "AudioPlayer/SET_SUBTITLE_DISPLAY_MODE"].includes(mutation.type)) schedule();
      });
      const updateHovered = (event) => {
        const button = event.target?.closest?.(".q-btn");
        if (button) this.update(button);
      };
      doc.addEventListener("mouseover", updateHovered, true);
      doc.addEventListener("focusin", updateHovered, true);
      onLocaleChange(ensure);
      ensure();
    }
  };
  /*! 原站命名修正：覆盖 i18n 文案、侧栏图标和页面标题，不改网站数据字段或接口。 */
  var nativeNavigationIcons = null;
  function syncNativeIcons() {
    const marks = [...pageWindow.document.querySelectorAll('a.q-item[href$="/favourites"] .q-icon')];
    const collections = [...pageWindow.document.querySelectorAll('a.q-item[href$="/playlists"] .q-icon')];
    if (!nativeNavigationIcons) {
      if (!marks[0]?.innerHTML.trim() || !collections[0]?.innerHTML.trim()) return;
      nativeNavigationIcons = { favourites: collections[0].innerHTML, playlists: marks[0].innerHTML };
    }
    for (const [path, icons] of [["favourites", marks], ["playlists", collections]]) {
      for (const icon of icons) {
        if (icon.innerHTML !== nativeNavigationIcons[path]) icon.innerHTML = nativeNavigationIcons[path];
        icon.setAttribute("data-aop-native-icon", path);
      }
    }
  }
  var SITE_RENAMES = {
    "zh-CN": {
      sidebar: { playlists: "收藏夹", myFavourites: "我的标记" },
      playlist: {
        addToPlaylist: "加入收藏夹",
        createPlaylist: "新建收藏夹",
        editPlaylist: "编辑收藏夹",
        deleteDialog: { title: "删除收藏夹", message: "删除后不可恢复，关注本收藏夹的人将无法再访问。确定要删除吗？" },
        filterOptions: { liked: "我关注的" },
        guestCanNotCreatePlaylist: "游客不能创建收藏夹",
        canNotCreatePreservedPlaylist: "不能创建系统保留的收藏夹",
        canNotDeletePreservedPlaylist: "不能删除系统保留的收藏夹",
        canNotLikeOwnPlaylist: "不能关注自己的收藏夹",
        playlistNotFound: "收藏夹不存在",
        preservedPlaylistName: { __SYS_PLAYLIST_MARKED: "快速收藏" }
      },
      settings: {
        quickMarkTarget: "默认收藏夹",
        quickMarkTargetCaption: "点击作品卡片右上角按钮后，作品将被添加到这个收藏夹",
        quickMarkTargetPlaylistReset: "默认收藏夹已重置为：{playlistName}"
      },
      favourites: { export: { exportToPlaylist: "导出到收藏夹", selectTargetPlaylist: "目标收藏夹" } },
      workTree: { addToPlayList: "加入播放队列" }
    },
    en: {
      sidebar: { playlists: "Collections", myFavourites: "My Marks" },
      playlist: {
        addToPlaylist: "Add to collection",
        createPlaylist: "Create collection",
        editPlaylist: "Edit collection",
        deleteDialog: { title: "Delete collection", message: "This action cannot be undone. Are you sure you want to delete this collection?" },
        guestCanNotCreatePlaylist: "Guests cannot create collections",
        canNotCreatePreservedPlaylist: "Cannot create system built-in collection",
        canNotDeletePreservedPlaylist: "Cannot delete system built-in collection",
        canNotLikeOwnPlaylist: "Cannot follow your own collection",
        playlistNotFound: "Collection not found",
        preservedPlaylistName: { __SYS_PLAYLIST_MARKED: "Quick saves" }
      },
      settings: {
        quickMarkTarget: "Default collection",
        quickMarkTargetCaption: "If you click the quick-mark button in the top-right corner of a work card, it will be added to this collection.",
        quickMarkTargetPlaylistReset: "The default collection has been reset to: {playlistName}."
      },
      favourites: { export: { exportToPlaylist: "Export to collection", selectTargetPlaylist: "Target collection" } },
      workTree: { addToPlayList: "Add to queue" }
    },
    ja: {
      sidebar: { playlists: "コレクション", myFavourites: "マーク" },
      playlist: { addToPlaylist: "コレクションに追加", preservedPlaylistName: { __SYS_PLAYLIST_MARKED: "クイック保存" } },
      workTree: { addToPlayList: "キューに追加" }
    }
  };
  var SITE_TITLE_RENAMES = [
    { key: "sidebar.playlists", original: "Playlists", pattern: (names) => `^(?:${names}) - `, to: (name) => `${name} - ` },
    { key: "sidebar.myFavourites", original: "Favourites", pattern: (names) => `^(?:${names}) - `, to: (name) => `${name} - ` },
    {
      key: "sidebar.playlists",
      original: "Playlist by",
      pattern: (names) => ` \\| (?:${names}) `,
      to: (name) => ` | ${name} · `,
      renamed: (name) => `${name} ·`
    }
  ];
  var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var messageAt = (messages, key) => key.split(".").reduce((o, k) => o && o[k], messages);
  var siteRenameFeature = {
    name: "site-rename",
    init(vm) {
      const i18n = vm.$i18n;
      if (i18n && typeof i18n.mergeLocaleMessage === "function") {
        for (const [locale, messages] of Object.entries(SITE_RENAMES)) i18n.mergeLocaleMessage(locale, messages);
      }
      const rules = SITE_TITLE_RENAMES.map((rule) => {
        const renamed = Object.values(SITE_RENAMES).map((m) => messageAt(m, rule.key)).filter(Boolean).map((name) => rule.renamed ? rule.renamed(name) : name);
        const names = [rule.original, ...renamed].map(escapeRegExp).join("|");
        return { ...rule, regexp: new RegExp(rule.pattern(names)) };
      });
      const fixTitle = () => {
        const doc = pageWindow.document;
        if (typeof vm.$t !== "function") return;
        let title = doc.title;
        for (const rule of rules) title = title.replace(rule.regexp, rule.to(vm.$t(rule.key)));
        if (title !== doc.title) doc.title = title;
      };
      syncNativeIcons();
      new MutationObserver(syncNativeIcons).observe(pageWindow.document.body, { childList: true, subtree: true, characterData: true });
      fixTitle();
      new MutationObserver(fixTitle).observe(pageWindow.document.head, { childList: true, subtree: true, characterData: true });
      if (i18n && typeof vm.$watch === "function") vm.$watch(() => i18n.locale, fixTitle);
    }
  };
  /*! 脚本公共样式；各功能特有的样式由各自 mount/init 注入。aop- 前缀避免影响原站组件。 */
  var BASE_CSS = `
      [data-aop-nav]:focus-visible { outline: 2px solid #1976d2; outline-offset: -3px; }
      .body--dark [data-aop-nav]:focus-visible { outline-color: #90caf9; }
      .aop-page { padding: 24px 32px 120px; max-width: 1400px; margin: 0 auto; color: #222; }
      .body--dark .aop-page { color: #eee; }
      .aop-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
      .aop-head h1 { font-size: 24px; line-height: 32px; margin: 0; font-weight: 500; color: inherit !important; }
      .aop-head .aop-count { color: #888; font-size: 14px; }
      .aop-head .aop-spacer { flex: 1; }
      .aop-date-group { margin: 20px 0 8px; color: #888; font-size: 13px; font-weight: 500; }
      .aop-card { background: #fff; border-radius: 4px; box-shadow: 0 1px 5px rgba(0,0,0,.2); overflow: hidden; }
      .body--dark .aop-card, .body--dark .aop-panel { background: #1d1d1d; color: #eee; }
      .aop-row { display: flex; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(128,128,128,.15); }
      .aop-row:last-child { border-bottom: none; }
      .aop-row:hover { background: rgba(128,128,128,.06); }
      .aop-cover { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; flex: none; cursor: pointer; }
      .aop-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      .aop-title { font-size: 15px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .aop-title:hover { color: #1976d2; }
      .aop-sub { color: #888; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .aop-progress { display: flex; align-items: center; gap: 10px; color: #888; font-size: 12px; }
      .aop-bar { flex: 0 1 280px; height: 4px; border-radius: 2px; background: rgba(128,128,128,.25); overflow: hidden; }
      .aop-fill { height: 100%; background: #1976d2; transition: width .3s linear; }
      .aop-actions { display: flex; align-items: center; gap: 8px; flex: none; }
      .aop-btn { border: none; border-radius: 4px; padding: 6px 14px; font-size: 13px; cursor: pointer;
        background: #1976d2; color: #fff; }
      .aop-btn.aop-flat { background: none; color: #888; }
      .aop-btn.aop-flat:hover { color: #c10015; }
      .aop-empty { padding: 64px 24px; text-align: center; color: #888; }
      .aop-backup { position: relative; }
      .aop-backup > summary { list-style: none; user-select: none; }
      .aop-backup > summary::-webkit-details-marker { display: none; }
      .aop-backup[open] > summary { color: #673ab7; }
      .aop-backup-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; width: 240px; padding: 6px;
        display: flex; flex-direction: column; align-items: stretch; background: #fff; border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,.2); }
      .body--dark .aop-backup-menu { background: #1d1d1d; }
      .aop-backup-menu .aop-btn { text-align: left; color: inherit; }
      .aop-backup-menu .aop-btn:hover { color: #673ab7; background: rgba(128,128,128,.08); }
      @media (max-width: 700px) {
        .aop-page { padding: 16px 12px 120px; }
        .aop-row { flex-wrap: wrap; }
        .aop-cover { width: 80px; height: 60px; }
        .aop-actions { width: 100%; justify-content: flex-end; }
      }
`;
  /*! 启动入口：等待网站 Vue 实例就绪，再初始化各功能；子页面的监听清理由各 view 模块负责。 */
  "use strict";
  function main() {
    if (pageWindow.location.protocol !== "https:" || !Object.hasOwn(SITE_API_KEYS, siteHost)) return;
    const features = [siteRenameFeature, progressFeature, favoritesFeature, soloWorksFeature, playlistRemoveFeature, playerHintsFeature, dataManagementFeature];
    pageWindow.document.documentElement.setAttribute("data-asmr-one-plus-version", SCRIPT_VERSION);
    log(`脚本 ${SCRIPT_VERSION} 已注入，等待网站加载…`);
    GM_addStyle(BASE_CSS);
    waitForApp().then((vm) => {
      watchLocale(vm);
      for (const feature of features) {
        try {
          feature.init(vm);
        } catch (err) {
          console.error(LOG_PREFIX, `${feature.name} 启动失败`, err);
        }
      }
      log("已加载");
    }).catch((err) => console.error(LOG_PREFIX, err));
  }
  main();
})();
