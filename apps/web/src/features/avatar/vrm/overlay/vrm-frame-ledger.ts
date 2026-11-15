import type { BoneMask } from '../../animation/contracts';
import { FRAME_PRIORITY, FrameLedger, type FrameLedgerSnapshot } from '../../animation/frame/ledger';
import { FramePlan } from '../../animation/frame/plan';
import type { PropHold } from '../props/vrm-prop-layer';
import type { VrmPoseLayer } from '../vrm-pose-layer';

/**
 * VRM 帧台账接线：把现有的「基础 clip / 行为 / 待机 / 叠加层」写入记录。
 *
 * 第一阶段只记录不拦截；冲突会以 dev warning 的形式出现，
 * 后续阶段再把 winner 变成真正的区域写权限。
 */

const ALL_BODY: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] };
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const REACT: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };
const SWAY: BoneMask = { include: ['spine', 'leftLeg', 'rightLeg'] };
const GAZE: BoneMask = { include: ['head', 'spine'] };
const SEAT: BoneMask = { include: ['spine', 'leftLeg', 'rightLeg'] };
const HOLD_LEFT: BoneMask = { include: ['leftArm'] };
const HOLD_RIGHT: BoneMask = { include: ['rightArm'] };

export interface FrameRecordContext {
  /** 无 clip 待机（程序化姿势） */
  procedural: boolean;
  /** 视线权重：交互期间淡出 */
  gazeWeight: number;
  /** 待机垂臂权重；0 = 让位给 clip/行为 */
  relaxWeight: number;
  /** 当前待机余兴动作 id；null = 没有余兴 */
  accent: string | null;
  /** 当前触摸反应/内部 MOTION 动作 id；null = 没有反应 */
  reaction: string | null;
  /** P8：剧本动作 id（独立槽位，全身接管）；null = 没有剧本动作 */
  scriptMotion?: string | null;
  /** S1 持物手型：只 claim 持物那只手，高于垂臂/行为 */
  propHold?: PropHold | null;
}

export class VrmFrameLedger {
  private readonly ledger = new FrameLedger();
  private plan: FramePlan | null = null;

  constructor(private readonly pose: VrmPoseLayer) {}

  /** 写入前：收集 claim 并决议，供 relax 等写者查询是否被拒绝 */
  beginFrame(ctx: FrameRecordContext): void {
    this.ledger.begin();
    const baseOwner = ctx.procedural ? 'base:procedural' : 'base:clip';
    this.ledger.claimMask(ALL_BODY, {
      owner: baseOwner,
      layer: 'base',
      mode: 'override',
      priority: FRAME_PRIORITY.base,
      weight: 1,
      intent: baseOwner,
    });

    const behavior = this.pose.behavior;
    if (behavior.id !== null && behavior.weight > 0) {
      for (const claim of this.pose.behaviorClaims) {
        this.ledger.claimMask(claim.mask, {
          owner: `behavior:${behavior.id}`,
          layer: 'motion',
          mode: 'override',
          priority: FRAME_PRIORITY.motion,
          weight: claim.weight,
          intent: claim.ref,
        });
      }
    }

    if (ctx.scriptMotion) {
      // 剧本动作：优先于行为/余兴/坐姿，仅次于道具持物与视线叠加
      this.ledger.claimMask(ALL_BODY, {
        owner: 'script:motion',
        layer: 'motion',
        mode: 'override',
        priority: FRAME_PRIORITY.script,
        weight: 1,
        intent: ctx.scriptMotion,
      });
    }
    if (ctx.relaxWeight > 0) {
      this.ledger.claimMask(ARMS, {
        owner: 'idle:relax',
        layer: 'motion',
        mode: 'override',
        priority: FRAME_PRIORITY.motion,
        weight: ctx.relaxWeight,
        intent: 'pose.arms-hang',
      });
    }
    if (ctx.accent) {
      // 余兴是完整身体动作：优先级高于垂臂，接管期间 relaxWeight 为 0
      this.ledger.claimMask(ALL_BODY, {
        owner: 'idle:accent',
        layer: 'motion',
        mode: 'override',
        priority: FRAME_PRIORITY.accent,
        weight: 1,
        intent: ctx.accent,
      });
    }
    if (this.pose.reacting && behavior.id === null) {
      this.ledger.claimMask(REACT, {
        owner: 'idle:react',
        layer: 'motion',
        mode: 'override',
        priority: FRAME_PRIORITY.motion,
        weight: 1,
        intent: ctx.reaction ?? 'motion.react-flinch',
      });
    }
    if (ctx.procedural && behavior.id === null) {
      this.ledger.claimMask(SWAY, {
        owner: 'idle:sway',
        layer: 'motion',
        mode: 'override',
        priority: FRAME_PRIORITY.idle,
        weight: 0.6,
        intent: 'motion.stance-sway',
      });
    }
    if (this.pose.seated) {
      this.ledger.claimMask(SEAT, {
        owner: 'overlay:seat',
        layer: 'overlay',
        mode: 'override',
        priority: FRAME_PRIORITY.seat,
        weight: 1,
        intent: 'pose.sit-ready',
      });
    }
    if (ctx.propHold) {
      this.ledger.claimMask(ctx.propHold.hand === 'left' ? HOLD_LEFT : HOLD_RIGHT, {
        owner: 'prop:hold',
        layer: 'overlay',
        mode: 'override',
        priority: FRAME_PRIORITY.prop,
        weight: 1,
        intent: ctx.propHold.pose,
      });
    }
    if (ctx.gazeWeight > 0) {
      this.ledger.claimMask(GAZE, {
        owner: 'overlay:gaze',
        layer: 'overlay',
        mode: 'additive',
        priority: FRAME_PRIORITY.overlay,
        weight: ctx.gazeWeight,
        intent: 'gaze',
      });
    }

    this.plan = new FramePlan(this.ledger.resolve());
  }

  /** 写入前查询：该 owner 是否在任一区域落败 */
  allows(owner: string): boolean {
    return this.plan?.allows(owner) ?? true;
  }

  /** 所有写入完成后落台账 */
  commit(timeMs: number): void {
    this.ledger.finish(timeMs);
  }

  get snapshot(): FrameLedgerSnapshot {
    return this.ledger.snapshot;
  }
}
