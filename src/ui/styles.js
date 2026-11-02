/*! 脚本公共样式；各功能特有的样式由各自 mount/init 注入。aop- 前缀避免影响原站组件。 */
const BASE_CSS = `
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

export { BASE_CSS };
