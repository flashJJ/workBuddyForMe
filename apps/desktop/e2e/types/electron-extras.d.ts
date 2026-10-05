/**
 * Electron 31 运行时存在但官方 d.ts 未声明的 API 补充（e2e 安全基线校验用）。
 * https://www.electronjs.org/docs/latest/api/web-contents#contentsgetlastwebpreferences
 */
declare namespace Electron {
  interface WebContents {
    /** 返回窗口最后一次实际生效的 WebPreferences（含 Chromium 填充的默认值） */
    getLastWebPreferences(): Electron.WebPreferences | null;
  }
}
