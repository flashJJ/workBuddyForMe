import type { VrmAnimationRuntime } from '../../../animation/adapters/vrm';

/**
 * v4.0：内容包姿势预览。
 * 只做限时叠加，不进入行为队列；到期自动释放，行为/动作开始时可主动清除。
 */
export class VrmPreviewPose {
  private id: string | null = null;
  private until = 0;

  constructor(private readonly runtime: () => VrmAnimationRuntime) {}

  play(id: string, holdMs = 2400): boolean {
    if (!this.runtime().poses.has(id)) return false;
    this.id = id;
    this.until = performance.now() + Math.max(200, holdMs);
    return true;
  }

  clear(): void {
    this.id = null;
  }

  apply(now: number): void {
    if (!this.id) return;
    if (now >= this.until) {
      this.id = null;
      return;
    }
    this.runtime().applyPose(this.id, 1, 0, false);
  }
}
