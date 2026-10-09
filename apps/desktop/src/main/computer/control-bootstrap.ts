/**
 * v0.7 桌面能力控制通道启动接线（v1.1 T2.4 从 main/index.ts 抽出，逻辑零改动）：
 * dev/prod 均启动（web server 侧经发现文件定位）。启动失败仅降级（computer 工具
 * 不可用），不阻断应用启动；返回的句柄负责退出期回收（指示圈/发现文件/通道服务）。
 */
import { clipboard, type BrowserWindow } from 'electron';
import { resolveComputerChannelFile } from '../config';
import {
  removeChannelDiscovery,
  startComputerChannel,
  writeChannelDiscovery,
  type ComputerChannel,
  type ComputerChannelHandlers,
} from './control-channel';
import { captureScreenSnapshot } from './screen';
import { createNutInputBackend } from './input';
import { listUiaElements } from './uia';
import { focusWindow, launchApp, listWindows } from './windows';
import { createClickOverlay, type ClickOverlay } from './overlay';

export interface ComputerControl {
  /** 通道服务；启动失败降级时为 null（决定退出期是否需要异步回收） */
  readonly channel: ComputerChannel | null;
  /** 同步回收：点击指示圈窗口 + 通道发现文件 */
  shutdownSync(): void;
  /** 完整回收：shutdownSync 后再关闭通道服务 */
  close(): Promise<void>;
}

export async function startComputerControl(deps: {
  userDataDir: string;
  isPackaged: boolean;
  getMainWindow: () => BrowserWindow | null;
}): Promise<ComputerControl> {
  let overlay: ClickOverlay | null = null;
  let channel: ComputerChannel | null = null;
  let discoveryFile: string | null = null;

  const shutdownSync = (): void => {
    overlay?.close();
    overlay = null;
    if (discoveryFile) {
      removeChannelDiscovery(discoveryFile);
      discoveryFile = null;
    }
  };

  try {
    const input = createNutInputBackend({
      setClipboard: (text) => clipboard.writeText(text),
    });
    overlay = createClickOverlay();
    const handlers: ComputerChannelHandlers = {
      // 截图前最小化主窗口，避免把 WorkBuddy 自身截进画面干扰模型定位
      snapshot: async (args) => {
        const win = deps.getMainWindow();
        const wasVisible = win?.isVisible() ?? false;
        const wasMinimized = win?.isMinimized() ?? false;
        if (win && wasVisible && !wasMinimized) {
          win.minimize();
          await new Promise((r) => setTimeout(r, 350));
        }
        try {
          return await captureScreenSnapshot(args);
        } finally {
          if (win && wasVisible && !wasMinimized) {
            win.restore();
            win.focus();
          }
        }
      },
      mouseMove: async ({ x, y }) => (await input.moveMouse(x, y), { ok: true as const }),
      mouseClick: async ({ x, y, button, double }) => {
        await input.moveMouse(x, y);
        overlay?.showClick(x, y);
        await input.click(button, double);
        return { ok: true as const };
      },
      mouseScroll: async ({ dx, dy }) => (await input.scroll(dx, dy), { ok: true as const }),
      mousePosition: () => input.getMousePosition(),
      keyboardType: async ({ text }) => (await input.typeText(text), { ok: true as const }),
      keyboardPress: async ({ keys }) => (await input.pressKeys(keys), { ok: true as const }),
      windowList: () => listWindows(),
      windowFocus: async (a) => (await focusWindow(a), { ok: true as const }),
      appLaunch: async (a) => (await launchApp(a), { ok: true as const }),
      uiaList: (a) => listUiaElements(a),
    };
    channel = await startComputerChannel({ handlers });
    discoveryFile = resolveComputerChannelFile(deps.userDataDir, deps.isPackaged);
    writeChannelDiscovery(discoveryFile, {
      version: 1,
      url: channel.url,
      token: channel.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    console.error('[wbfm] 控制通道就绪:', channel.url);
  } catch (error) {
    // 与历史行为一致：通道/发现文件句柄置空，指示圈保留到退出期 shutdownSync 回收
    channel = null;
    discoveryFile = null;
    console.error('[wbfm] 控制通道启动失败（屏幕感知不可用）:', error);
  }

  return {
    get channel() {
      return channel;
    },
    shutdownSync,
    async close() {
      const active = channel;
      shutdownSync();
      channel = null;
      await active?.close();
    },
  };
}
