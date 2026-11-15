import type { VrmAnimationRuntime } from '../../../animation/adapters/vrm';
import type { BoneMask } from '../../../animation/contracts';

/**
 * P8 桥接点 3：剧本专用动作层。
 *
 * 与待机层的 reaction 槽分离：
 * - 触摸反应仍归 `VrmIdleOverlay`（REACT_MASK，点击触发、到时释放）；
 * - 剧本 `motion` cue 走这里，全身 mask + cue 自带 loop/fadeMs，不与点击互相打断；
 * - 非循环动作在结尾按 fadeMs 淡出后自动释放；循环动作由场景结束显式 stop。
 */

const SCRIPT_MOTION_MASK: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};
/** 淡入/淡出默认时长；cue.fadeMs 可覆盖 */
const DEFAULT_FADE_MS = 160;

export interface ScriptMotionOptions {
  loop?: boolean;
  fadeMs?: number;
}

interface ScriptMotionState {
  id: string;
  elapsedMs: number;
  durationMs: number;
  loop: boolean;
  fadeMs: number;
}

export class VrmScriptMotionOverlay {
  private current: ScriptMotionState | null = null;

  constructor(private readonly anim: VrmAnimationRuntime) {}

  /** 播放内部 MOTION；返回 false = 动作未注册 */
  play(id: string, options: ScriptMotionOptions = {}): boolean {
    const durationMs = this.anim.motions.get(id)?.durationMs ?? 0;
    if (!(durationMs > 0)) return false;
    this.current = {
      id,
      elapsedMs: 0,
      durationMs,
      loop: options.loop ?? false,
      fadeMs: Math.max(0, options.fadeMs ?? DEFAULT_FADE_MS),
    };
    return true;
  }

  /** 停止；传 id 时只在当前动作匹配时停止（多场景共用时不抢停） */
  stop(id?: string): boolean {
    if (!this.current || (id !== undefined && this.current.id !== id)) return false;
    this.current = null;
    return true;
  }

  get active(): boolean {
    return this.current !== null;
  }

  get motionId(): string | null {
    return this.current?.id ?? null;
  }

  /** 每帧推进；返回 true = 本帧写入了身体（待机余兴/垂臂应让位） */
  update(dtMs: number): boolean {
    const cur = this.current;
    if (!cur) return false;
    cur.elapsedMs += dtMs;
    // 非循环动作：时长 + 淡出结束后释放，交给待机层重新排期
    if (!cur.loop && cur.elapsedMs >= cur.durationMs + cur.fadeMs) {
      this.current = null;
      return false;
    }
    const weight = this.weight(cur);
    if (weight <= 0) return false;
    this.anim.applyMotion(cur.id, cur.elapsedMs, weight, 0, SCRIPT_MOTION_MASK);
    return true;
  }

  /** 开头淡入；非循环动作在结尾同时淡出，循环动作只在开头淡入 */
  private weight(cur: ScriptMotionState): number {
    if (cur.fadeMs <= 0) return 1;
    const fadeIn = Math.min(1, cur.elapsedMs / cur.fadeMs);
    if (cur.loop) return fadeIn;
    const remaining = cur.durationMs + cur.fadeMs - cur.elapsedMs;
    return Math.min(fadeIn, Math.max(0, remaining / cur.fadeMs));
  }
}
