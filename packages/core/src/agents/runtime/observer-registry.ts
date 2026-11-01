/**
 * v1.9 M2：等待 owner 启动的舞台观察者注册表。
 *
 * 舞台窗可能早于主会话 owner SSE 打开（run 行已建、执行未启动）。
 * 与其让客户端 409 退避轮询（快 run 会整段错过 live 现场），不如在服务端
 * 有界挂起：owner 一注册总线即原子唤醒，观察者从第一帧开始看。
 */
export class PendingObserverRegistry<T> {
  private readonly pending = new Map<string, Set<(bus: T | null) => void>>();

  /** owner 总线就绪：唤醒该 run 全部等待者 */
  publish(runId: string, bus: T): void {
    this.flush(runId, bus);
  }

  /** owner 启动失败/未订阅即取消：放行等待者（调用方回落终态回放） */
  fail(runId: string): void {
    this.flush(runId, null);
  }

  /**
   * 有界等待 run 总线。existing 非空立即返回；否则挂入队列等唤醒或超时。
   */
  async await(runId: string, waitMs: number, getExisting: () => T | undefined): Promise<T | null> {
    const direct = getExisting();
    if (direct) return direct;
    return new Promise((resolve) => {
      const set = this.pending.get(runId) ?? new Set();
      const timer = setTimeout(() => {
        set.delete(onBus);
        if (set.size === 0) this.pending.delete(runId);
        resolve(null);
      }, waitMs);
      const onBus = (bus: T | null) => {
        clearTimeout(timer);
        set.delete(onBus);
        if (set.size === 0) this.pending.delete(runId);
        resolve(bus);
      };
      set.add(onBus);
      this.pending.set(runId, set);
    });
  }

  private flush(runId: string, bus: T | null): void {
    const waiters = this.pending.get(runId);
    if (!waiters) return;
    this.pending.delete(runId);
    for (const resolve of waiters) resolve(bus);
  }
}
