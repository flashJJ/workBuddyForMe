/**
 * v2.0 M3 系统事件感知 IPC（powerMonitor ↔ 渲染端）。
 *
 * 隐私门控（默认关、显式授权）：
 * - 渲染端 invoke('awareness:set-enabled', true) 后才挂电源监听与空闲轮询；
 * - false/重载/退出即拆除全部监听与定时器（重复调用幂等）；
 * - 主进程不缓存、不落盘任何事件，只做单向广播；不接触窗口标题/屏幕/文档。
 */
import {
  AWARENESS_IDLE_POLL_MS,
  type AwarenessEvent,
} from '@wbfm/shared/awareness';

/** 需要监听的 powerMonitor 通道 → 广播事件类型 */
const POWER_CHANNELS = [
  ['unlock-screen', 'unlock'],
  ['lock-screen', 'lock'],
  ['resume', 'resume'],
  ['suspend', 'suspend'],
] as const;

export interface AwarenessPowerMonitorLike {
  on(channel: string, listener: () => void): unknown;
  off(channel: string, listener: () => void): unknown;
  getSystemIdleTime(): number;
}

export interface AwarenessIpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
  removeHandler(channel: string): void;
}

export interface AwarenessTimerLike {
  setInterval(cb: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface RegisterAwarenessDeps {
  ipc: AwarenessIpcMainLike;
  powerMonitor: AwarenessPowerMonitorLike;
  /** 广播给所有渲染窗口（主窗/桌宠窗；发送由接线层遍历 BrowserWindow） */
  broadcast: (event: AwarenessEvent) => void;
  /** 测试注入 */
  now?: () => number;
  idlePollMs?: number;
  timers?: AwarenessTimerLike;
}

/**
 * 注册 awareness:set-enabled；返回注销函数（停采集 + removeHandler）。
 * 初始态恒为关闭：应用每次启动必须由渲染端依设置重新武装。
 */
export function registerAwarenessIpc(deps: RegisterAwarenessDeps): () => void {
  const now = deps.now ?? (() => Date.now());
  const pollMs = deps.idlePollMs ?? AWARENESS_IDLE_POLL_MS;
  const timers: AwarenessTimerLike =
    deps.timers ?? {
      setInterval: (cb, ms) => setInterval(cb, ms),
      clearInterval: (id) => clearInterval(id as NodeJS.Timeout),
    };

  let enabled = false;
  let timer: unknown = null;
  const listeners = POWER_CHANNELS.map(([channel, type]) => ({
    channel,
    listener: (): void => deps.broadcast({ type, at: now() }),
  }));

  const emitIdleSample = (): void => {
    deps.broadcast({ type: 'idle', at: now(), idleSeconds: deps.powerMonitor.getSystemIdleTime() });
  };

  const start = (): void => {
    if (enabled) return;
    enabled = true;
    for (const { channel, listener } of listeners) {
      deps.powerMonitor.on(channel, listener);
    }
    timer = timers.setInterval(emitIdleSample, pollMs);
    // 立即补一个样本，渲染端不必等首个轮询周期
    emitIdleSample();
  };

  const stop = (): void => {
    if (!enabled) return;
    enabled = false;
    for (const { channel, listener } of listeners) {
      deps.powerMonitor.off(channel, listener);
    }
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
  };

  deps.ipc.handle('awareness:set-enabled', (_event, raw) => {
    // 仅接受布尔；非法负载保持现状，不抛错
    if (raw === true) start();
    else if (raw === false) stop();
  });

  return () => {
    stop();
    deps.ipc.removeHandler('awareness:set-enabled');
  };
}
