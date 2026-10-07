/**
 * M4-VAD ASR 轮次跟踪器（纯类，可单测）。
 *
 * 解决三个问题：
 * 1. 单飞：同一时刻只允许一个识别请求；新结束的语音段进入单槽排队，
 *    识别完成后自动补发（不并发 ASR）。
 * 2. 超时：20s 无结果释放单飞并回调，调用方回到 listening，永不卡在 thinking。
 * 3. stale 丢弃：迟到的旧轮次响应（abort 后到达等）经 isCurrent 校验后丢弃。
 *
 * 计时器可注入（测试用同步/手动调度器）；生产默认 setTimeout/clearTimeout。
 */

export type TimerScheduler = (cb: () => void, ms: number) => () => void;

const defaultScheduler: TimerScheduler = (cb, ms) => {
  const t = setTimeout(cb, ms);
  return () => clearTimeout(t);
};

interface ActiveTurn {
  id: string;
  cancelTimer: () => void;
}

export class AsrTurnTracker {
  private active: ActiveTurn | null = null;

  constructor(
    readonly timeoutMs = 20_000,
    private readonly schedule: TimerScheduler = defaultScheduler,
  ) {}

  get currentTurnId(): string | null {
    return this.active?.id ?? null;
  }

  get isBusy(): boolean {
    return this.active !== null;
  }

  isCurrent(turnId: string): boolean {
    return this.active?.id === turnId;
  }

  /**
   * 开始新一轮识别（不负责取消排队段——排队由编排层维护）。
   * 若已有轮次（理论上调用方已用 isBusy 门控），先作废它。
   * 返回新 turnId。
   */
  start(onTimeout: () => void): string {
    this.active?.cancelTimer();
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const cancelTimer = this.schedule(() => {
      // 仅当超时命中的仍是当前轮次才生效
      if (this.active?.id === id) {
        this.active = null;
        onTimeout();
      }
    }, this.timeoutMs);
    this.active = { id, cancelTimer };
    return id;
  }

  /**
   * 正常结束轮次。
   * @returns true=当前轮次，响应应被消费；false=陈旧轮次，响应丢弃
   */
  finish(turnId: string): boolean {
    if (this.active?.id !== turnId) return false;
    this.active.cancelTimer();
    this.active = null;
    return true;
  }

  /** 作废当前轮次（关闭监控/切换会话/卸载）；不触发 onTimeout */
  cancel(): void {
    this.active?.cancelTimer();
    this.active = null;
  }
}
