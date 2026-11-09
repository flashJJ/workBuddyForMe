/**
 * v3.0 P1：Live2D 待机动作调度（从 Live2dController 抽出）。
 *
 * 单定时器链：动作播完 → 随机 7–14s 后再播；说话/睡眠期间跳过并重新计时，
 * 避免多条 setTimeout 叠加导致动作越播越快。
 */

export interface IdleModelLike {
  motion(group: string): Promise<unknown>;
}

export interface Live2dIdleSchedulerDeps {
  getModel: () => IdleModelLike | null;
  idleGroup: string;
  /** 说话/动作期间返回 false → 本轮不播，继续排下一轮 */
  isQuiet: () => boolean;
  isDisposed: () => boolean;
}

export const IDLE_INTERVAL_MIN = 7000;
export const IDLE_INTERVAL_MAX = 14000;

export class Live2dIdleScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sleeping = false;

  constructor(private readonly deps: Live2dIdleSchedulerDeps) {}

  start(): void {
    this.schedule();
  }

  /** 睡眠暂停、唤醒后重新起链 */
  setSleeping(sleeping: boolean): void {
    if (this.sleeping === sleeping) return;
    this.sleeping = sleeping;
    if (sleeping) this.stop();
    else this.schedule();
  }

  stop(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.stop();
    if (this.sleeping || this.deps.isDisposed()) return;
    const delay = IDLE_INTERVAL_MIN + Math.random() * (IDLE_INTERVAL_MAX - IDLE_INTERVAL_MIN);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.sleeping || this.deps.isDisposed()) return;
      const model = this.deps.getModel();
      if (!model) return;
      if (this.deps.isQuiet()) {
        void model.motion(this.deps.idleGroup).then(() => this.schedule());
      } else {
        this.schedule();
      }
    }, delay);
  }
}
