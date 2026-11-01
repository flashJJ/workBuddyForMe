import type { InteractionKind } from '@wbfm/shared/schemas';

/** 三段式交互阶段 */
export type InteractionPhase = 'idle' | 'start' | 'loop' | 'end';

/** start 阶段时长（ms）—— VPpet A_Start */
const START_DURATION_MS = 200;
/** end 阶段时长（ms）—— VPpet C_End */
const END_DURATION_MS = 300;

/**
 * 三段式 InteractionState 状态机（由 VrmController 外迁）。
 *
 * 语义（VPpet A_Start → B_Loop → C_End）：
 * - `start`：入场；重复 start 不打断；
 * - `loop`：持续按住，由外部 continue 维持，重复 start 只延长计时；
 * - `end`：收尾，时间到自动回 `idle`；收尾期间新的 start 被丢弃。
 *
 * 本类只产出「阶段 + 叠加微倾角度」，不碰骨骼与表情（那由 VrmPoseLayer / VrmFaceLayer 落）。
 */
export class VrmInteractionState {
  private phase: InteractionPhase = 'idle';
  /** 交互类型（head-touch / body-touch 等） */
  private kind: InteractionKind | null = null;
  /** 进入 start 阶段的时间戳 */
  private startAt = 0;
  /** end 阶段完成时间戳（到时后回到 idle） */
  private endAt = 0;

  get currentPhase(): InteractionPhase {
    return this.phase;
  }

  /** 是否处于持续按住（呼吸加深判定用） */
  get isLooping(): boolean {
    return this.phase === 'loop';
  }

  /** 开始交互（tap / 长按触发） */
  start(kind: InteractionKind): void {
    const now = performance.now();
    switch (this.phase) {
      case 'start':
        // 入场动画播放中——VPpet 直接 return，不打断
        return;
      case 'loop':
        // 正在持续按住——延长 loop，不重开
        this.startAt = now;
        return;
      case 'end':
        // 收尾动画还没做完——丢弃，等收尾完了再说
        return;
      case 'idle':
      default:
        this.phase = 'start';
        this.kind = kind;
        this.startAt = now;
    }
  }

  /** 结束交互（松手触发）；返回是否真的进入了收尾阶段 */
  end(): boolean {
    if (this.phase !== 'start' && this.phase !== 'loop') return false;
    this.phase = 'end';
    this.endAt = performance.now() + END_DURATION_MS;
    return true;
  }

  /** phase 推进：start → loop（等外部 end）→ end → idle */
  tick(): void {
    const now = performance.now();
    switch (this.phase) {
      case 'start':
        if (now - this.startAt >= START_DURATION_MS) this.phase = 'loop';
        break;
      case 'end':
        if (now >= this.endAt) {
          this.phase = 'idle';
          this.kind = null;
        }
        break;
      case 'loop':
      case 'idle':
      default:
        // loop 保持（等外部 end），idle 保持
        break;
    }
  }

  /** 三段式叠加微倾角度（idle 时为零角） */
  overlayAngles(): { yaw: number; pitch: number } {
    if (this.phase === 'idle') return { yaw: 0, pitch: 0 };
    if (this.phase === 'start') {
      // start 入场：头部微下倾，0 → 1 → 0
      const envelope = Math.sin(((performance.now() - this.startAt) / START_DURATION_MS) * Math.PI);
      return { yaw: 0.08 * envelope, pitch: 0.04 * envelope };
    }
    if (this.phase === 'loop') {
      // loop 持续：头部微倾保持
      return { yaw: 0.06, pitch: 0.03 };
    }
    // end 收尾：回正，衰减
    const remaining = Math.max(0, (this.endAt - performance.now()) / END_DURATION_MS);
    return { yaw: 0.06 * remaining, pitch: 0.03 * remaining };
  }
}
