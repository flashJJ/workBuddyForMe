/**
 * v1.7 UI 侧事件总线（仅渲染进程，模块单例）。
 *
 * 任务族（成功庆祝/失败打气）只在 UI 会话消费：api/mcp/远端终态不经过本总线，
 * 满足「无人值守 desktop 不主动弹窗」红线。监听器只在对话页存活期挂载。
 */

/** 任务协作/Flow run 在 UI 侧到达终态时广播 */
export type UiTaskOutcome = 'success' | 'failure';

type UiTaskListener = (outcome: UiTaskOutcome) => void;

class UiTaskEventBus {
  private readonly listeners = new Set<UiTaskListener>();

  /** 广播终态（无监听者时静默丢弃，不入队、不补发） */
  emit(outcome: UiTaskOutcome): void {
    for (const listener of this.listeners) {
      try {
        listener(outcome);
      } catch {
        /* 单个监听异常不影响其余订阅 */
      }
    }
  }

  subscribe(listener: UiTaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 测试用：清空订阅 */
  clear(): void {
    this.listeners.clear();
  }
}

export const uiTaskEventBus = new UiTaskEventBus();
