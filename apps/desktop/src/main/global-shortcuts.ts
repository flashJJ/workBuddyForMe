/**
 * 全局快捷键接线（v1.1 T2.4 从 main/index.ts 抽出，逻辑零改动）。
 * 注销仍由 index.ts 的 will-quit 统一 globalShortcut.unregisterAll()。
 */
import { globalShortcut, type BrowserWindow } from 'electron';
import { DEV_SERVER_URL } from './config';
import type { ManagedServer } from './server-manager';

/**
 * 全局快捷键（M5）：Ctrl+K 唤起命令面板。
 * 窗口未聚焦时先聚焦再发事件；窗口已聚焦时仅切换开关。
 * 开发态也注册（便于体验），退出前注销避免残留。
 *
 * v0.7 M3-4c：另注册 Ctrl+Alt+Esc 急停热键，触发即调 web server 的
 * POST /api/tasks/stop-all 中断全部活跃桌面任务。
 * - 打包态：经 managedServer.url + token 走鉴权通道
 * - 开发态：直连 DEV_SERVER_URL；dev server 未启动时静默忽略
 */
export function registerGlobalShortcuts(deps: {
  getMainWindow: () => BrowserWindow | null;
  getManagedServer: () => ManagedServer | null;
}): void {
  const registered = globalShortcut.register('CommandOrControl+K', () => {
    const win = deps.getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isFocused()) win.focus();
    win.webContents.send('command-palette:open');
  });
  if (!registered) {
    console.error('[wbfm] 全局快捷键 Ctrl+K 注册失败（可能被其他应用占用）');
  }

  const emergencyRegistered = globalShortcut.register('CommandOrControl+Alt+Escape', () => {
    void triggerEmergencyStop(deps.getManagedServer).catch((error) => {
      console.error('[wbfm] 急停热键调用失败:', error);
    });
  });
  if (!emergencyRegistered) {
    console.error('[wbfm] 急停热键 Ctrl+Alt+Esc 注册失败（可能被其他应用占用）');
  }
}

/**
 * 急停 HTTP 调用：POST /api/tasks/stop-all。
 * 打包态用 managedServer.url+token；开发态回落 DEV_SERVER_URL，无 token。
 * dev server 未启动时 fetch 会失败，仅记录不阻断（急停是兜底动作，无任务时也安全）。
 */
async function triggerEmergencyStop(getManagedServer: () => ManagedServer | null): Promise<void> {
  const managedServer = getManagedServer();
  const url = managedServer?.url ?? DEV_SERVER_URL;
  const headers: Record<string, string> = {};
  if (managedServer) headers['x-wbfm-token'] = managedServer.token;
  try {
    const res = await fetch(`${url}/api/tasks/stop-all`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      console.error(`[wbfm] 急停 stop-all 返回 ${res.status}`);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { data?: { stopped?: number } };
    const stopped = body?.data?.stopped ?? 0;
    console.error(`[wbfm] 急停完成，中断任务数=${stopped}`);
  } catch (error) {
    // 开发态 dev server 未启动时属正常情况，仅记录
    if (managedServer) console.error('[wbfm] 急停 HTTP 调用失败:', error);
  }
}
