/**
 * v2.0 M3 系统事件感知桥契约（主进程 powerMonitor ↔ 渲染进程）。
 *
 * 隐私纪律（路线图 G3，默认关闭、显式授权）：
 * - 主进程仅在渲染端 setEnabled(true) 后才挂电源监听与空闲轮询，关闭/重载即拆；
 * - 事件只表达「解锁/锁屏/睡眠/唤醒/系统空闲秒数」，不含窗口标题/屏幕/文档内容；
 * - 主进程不缓存、不落盘任何事件；渲染端只做即时触发评估，不保存原始信号。
 */

/** 电源/空闲事件（at 为事件产生时的 Unix 毫秒；idle 事件带系统空闲秒数） */
export type AwarenessEvent =
  | { type: 'unlock'; at: number }
  | { type: 'lock'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'suspend'; at: number }
  | { type: 'idle'; at: number; idleSeconds: number };

/** 空闲轮询周期（主进程 30s 采样一次 getSystemIdleTime） */
export const AWARENESS_IDLE_POLL_MS = 30_000;

/** preload 通过 contextBridge 暴露的感知桥（window.wbfm.awareness） */
export interface WbfmAwarenessBridge {
  /**
   * 开关系统事件采集。true=主进程开始监听电源事件并轮询空闲；
   * false=立即拆除全部监听与定时器（重复调用幂等）。
   */
  setEnabled(enabled: boolean): Promise<void>;
  /** 订阅主进程单向广播，返回取消订阅 */
  onEvent(cb: (event: AwarenessEvent) => void): () => void;
}
