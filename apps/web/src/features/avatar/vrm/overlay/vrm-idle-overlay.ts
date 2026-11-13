import type { BoneMask } from '../../animation/contracts';
import type { VrmAnimationRuntime } from '../../animation/adapters/vrm';

/** 重心换脚只写脊柱与腿；触摸反应覆盖脊柱/头/双臂 */
const STANCE_MASK: BoneMask = { include: ['spine', 'leftLeg', 'rightLeg'] };
const REACT_MASK: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };
const ACCENT_MASK: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};
const STANCE_WEIGHT = 0.6;

/** 待机余兴动作：每隔 25–40s 插一段站姿变化，避免待机只剩重心换脚 */
const ACCENT_MOTIONS = [
  'motion.hands-front',
  'motion.hands-pocket',
  'motion.arms-crossed',
  'motion.lean-wall',
  'motion.tiptoe',
] as const;
/** 最长余兴动作为 3.8s（lean-wall），留一点余量后释放 */
const ACCENT_DURATION_MS = 3900;
const ACCENT_GAP_MIN_MS = 25_000;
const ACCENT_GAP_JITTER_MS = 15_000;

/**
 * 待机身体层：把 L2 动作接到没有 clip 的待机链路上。
 * - `motion.stance-sway` 循环播放，替代「站着完全不动」
 * - 周期性插入站姿余兴动作（双手身前/插兜/抱臂/靠墙/踮脚）
 * - `motion.react-flinch` 被戳时播一次，到时自动停止
 * 都在头部叠加之前写入，视线/微倾仍可在其之上合成。
 */
export class VrmIdleOverlay {
  private reaction: { id: string; startedAt: number; durationMs: number } | null = null;
  private accent: { id: string; startedAt: number } | null = null;
  private nextAccentAt = 0;
  /** 剧本场景播放期间：待机余兴/重心摆动让位 */
  private scriptBusy = false;

  constructor(private readonly anim: VrmAnimationRuntime) {}

  /** 剧本场次开始时抑制待机余兴；结束时恢复排期 */
  setScriptBusy(busy: boolean): void {
    this.scriptBusy = busy;
    if (busy) this.release();
  }

  /** 播一次触摸反应/内部 MOTION；返回 false 表示该动作不存在 */
  playReaction(id: string, durationMs: number): boolean {
    if (!this.anim.hasMotion(id)) return false;
    // 反应优先：清掉余兴，避免两个同优先级写者同时存在
    this.accent = null;
    this.nextAccentAt = 0;
    this.reaction = { id, startedAt: performance.now(), durationMs };
    return true;
  }

  get reacting(): boolean {
    return this.reaction !== null;
  }

  /** 当前反应动作 id；null = 没有反应 */
  get reactionId(): string | null {
    return this.reaction?.id ?? null;
  }

  /** 当前余兴动作 id；null = 没有余兴 */
  get accentId(): string | null {
    return this.accent?.id ?? null;
  }

  /** 每帧调用：paused = 睡眠/背对，procedural = 没有 clip 待机，suppressed = 剧本动作占用身体 */
  update(t: number, procedural: boolean, paused: boolean, suppressed = false): void {
    if (paused || suppressed || this.scriptBusy) {
      // 睡眠/背对/剧本动作期间丢弃未完成的余兴与反应：否则恢复后从半截姿势续播，
      // 背对时还会把双手留在身体前方（被躯干挡住，看起来像手不见了）
      this.release();
      return;
    }
    if (this.anim.active) {
      // 行为接管时余兴/反应必须让位；清掉状态，避免 relax 被误判为仍在写手臂
      this.accent = null;
      this.reaction = null;
      this.nextAccentAt = 0;
      return;
    }
    if (procedural) {
      this.anim.applyMotion('motion.stance-sway', t * 1000, STANCE_WEIGHT, 0, STANCE_MASK);
    }
    // 有余兴时身体由余兴接管；有 clip 待机时也允许插入，形成「待机中间的小动作」
    this.updateAccent();
    const r = this.reaction;
    if (!r) return;
    const elapsed = performance.now() - r.startedAt;
    if (elapsed >= r.durationMs) {
      this.reaction = null;
      return;
    }
    this.anim.applyMotion(r.id, elapsed, 1, 0, REACT_MASK);
  }

  /** 丢弃未完成的余兴/反应，并让下次余兴重新计时 */
  private release(): void {
    this.reaction = null;
    this.accent = null;
    this.nextAccentAt = 0;
  }

  /** 余兴动作调度：空闲到期 → 随机播一段 → 结束后重新计时 */
  private updateAccent(): void {
    const now = performance.now();
    if (this.nextAccentAt === 0) {
      this.nextAccentAt = now + ACCENT_GAP_MIN_MS + Math.random() * ACCENT_GAP_JITTER_MS;
    }
    if (!this.accent && !this.reaction && now >= this.nextAccentAt) {
      const index = Math.floor(Math.random() * ACCENT_MOTIONS.length);
      this.accent = { id: ACCENT_MOTIONS[index]!, startedAt: now };
    }
    const current = this.accent;
    if (!current) return;
    const elapsed = now - current.startedAt;
    if (elapsed >= ACCENT_DURATION_MS) {
      this.accent = null;
      this.nextAccentAt = now + ACCENT_GAP_MIN_MS + Math.random() * ACCENT_GAP_JITTER_MS;
      return;
    }
    this.anim.applyMotion(current.id, elapsed, 1, 0, ACCENT_MASK);
  }
}
