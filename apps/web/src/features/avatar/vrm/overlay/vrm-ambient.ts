import { pickAmbientBehavior, type AmbientBehavior, type ProceduralGestureKind } from '../../performance/gesture';

/**
 * 环境微行为调度（从 VrmController 外迁）：空闲时每 8–20s 随机眨眼 / 点头 / 歪头 / 瞥视。
 * 是否空闲由调用方判定（睡眠 / 背对 / 手势 / 交互期间不打扰），本类只做计时与随机。
 */
export class VrmAmbient {
  private nextAt = 0;

  constructor(
    private readonly blink: () => void,
    private readonly gesture: (kind: ProceduralGestureKind) => void,
    private readonly random: () => number = Math.random,
  ) {}

  tick(now: number, idle: boolean): void {
    if (!idle) return;
    if (this.nextAt === 0) {
      this.nextAt = now + 6000 + this.random() * 6000;
      return;
    }
    if (now < this.nextAt) return;
    this.nextAt = now + 8000 + this.random() * 12_000;
    const behavior: AmbientBehavior = pickAmbientBehavior(this.random());
    if (behavior === 'blink') this.blink();
    else this.gesture(behavior);
  }

  /** 唤醒后重新排期，避免把睡眠时长一次性补成「立刻做动作」 */
  reset(): void {
    this.nextAt = 0;
  }
}
