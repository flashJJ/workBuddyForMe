import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  MOTION_ROTATION_SECONDS_DEFAULT,
  MOTION_ROTATION_SECONDS_MAX,
  MOTION_ROTATION_SECONDS_MIN,
} from '@wbfm/shared/constants';
import { entryLoopClip, groupMotionEntries, type MotionEntry, type MotionPoolEntry } from './motion-segments';
import {
  allEntryClips,
  crossFadeLoopAction,
  embeddedSingleEntry,
  selectEmbeddedClips,
  startLoopAction,
} from './motion-clips';
import { HoldMotionScheduler } from './motion-hold';
import { sampleAnimatedBounds } from './motion-fit-sampler';

/** 待机动作轮播配置 */
export interface MotionRotationConfig {
  enabled: boolean;
  seconds: number;
}

/**
 * 动作池 + 单 mixer 协作者（由 VrmController 外迁）。
 *
 * 动作模型：**单一 mixer + 动作条目池**。
 * - 动作池 = 内置 daiji + 全部已导入 VRMA（由 vrm-canvas 的 loadMotionPool 组装成
 *   `MotionPoolEntry[]`，再按 `entryKey` 聚合成 `MotionEntry[]`）。
 * - `currentIdleEntry` 是池内当前循环播放的条目；`rotateIdleMotion()` 随机换一条（crossFade）。
 * - `playRandomGesture()` 从池里随机播一条一次性动作（LoopOnce → 播完回待机）。
 * - **v2.2 M1 段调度**：长按三段式（A → B → C）外迁给 `HoldMotionScheduler`。
 * 只用单 mixer 是必须的：两个 mixer 会争同一批 normalized bone，权重无法混合。
 *
 * 本类只负责「哪条 clip 在播」，不碰骨骼叠加层与表情层（那由 VrmPoseLayer / VrmFaceLayer 管）。
 */
export class MotionMixer {
  private readonly vrm: VRM;
  private readonly mixer: THREE.AnimationMixer;
  /** 动作条目池（初始待机排首位）；空池时退回模型内嵌 clip / 程序化姿态 */
  private entries: MotionEntry[];
  private readonly tapClip: THREE.AnimationClip | null;
  private currentIdleEntry: MotionEntry | null = null;
  /** 当前循环播放的待机 action（长按/手势期间保留引用，用于回待机） */
  private currentIdleAction: THREE.AnimationAction | null = null;
  /** 正在播的一次性手势 action（非 null 时不打断轮播） */
  private gestureAction: THREE.AnimationAction | null = null;
  private readonly hold: HoldMotionScheduler;
  private rotationConfig: MotionRotationConfig = {
    enabled: true,
    seconds: MOTION_ROTATION_SECONDS_DEFAULT,
  };
  /** 距下次轮播的累计秒数 */
  private rotationElapsed = 0;

  constructor(
    vrm: VRM,
    gltfAnimations: THREE.AnimationClip[] | undefined,
    /** 动作池（内置 + 已导入 VRMA）；空数组/undefined 时退回模型内嵌 clip 或程序化姿态 */
    motionPool?: MotionPoolEntry[] | null,
    rotationConfig?: MotionRotationConfig | null,
  ) {
    this.vrm = vrm;
    // 单 mixer：优先复用 three-vrm 自带的（已绑定正确的 root）
    const existing = (vrm as unknown as { animationMixer?: THREE.AnimationMixer }).animationMixer;
    const root = vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
    this.mixer = existing ?? new THREE.AnimationMixer(root);
    this.mixer.addEventListener('finished', this.onActionFinished);
    if (rotationConfig) this.setRotationConfig(rotationConfig);

    const embedded = selectEmbeddedClips(gltfAnimations ?? []);
    this.tapClip = embedded.tapClip;
    this.entries = groupMotionEntries(motionPool ?? []);
    // 无动作池（也未导入）时把模型内嵌 idle clip 当成单段条目，避免整只走程序化
    if (this.entries.length === 0 && embedded.idleClip) {
      this.entries = [embeddedSingleEntry(embedded.idleClip)];
    }
    this.hold = new HoldMotionScheduler({
      mixer: this.mixer,
      entries: this.entries,
      getIdleAction: () => this.currentIdleAction,
      returnToIdle: (from) => this.returnToIdle(from),
    });

    const first = this.entries[0] ?? null;
    if (first) this.startIdleLoop(first);
  }

  /** 是否无任何 clip 可用（VrmController 据此走程序化姿态） */
  get usesProceduralPose(): boolean {
    return this.currentIdleEntry === null;
  }

  /** 动作条目数 */
  get poolSize(): number {
    return this.entries.length;
  }

  /** 当前待机 clip 名（调试钩子用） */
  get idleClipName(): string | null {
    return this.currentIdleEntry?.loopClip.name ?? null;
  }

  /** 是否正在播一次性手势 */
  get hasGesture(): boolean {
    return this.gestureAction !== null;
  }

  /** 是否正在长按段调度中 */
  get isHolding(): boolean {
    return this.hold.isHolding;
  }

  /** 当前在播的 clip 名（长按 > 手势 > 待机；调试与测试用） */
  get currentClipName(): string | null {
    const action = this.hold.currentAction ?? this.gestureAction ?? this.currentIdleAction;
    return action?.getClip().name ?? null;
  }

  /** 注入待机动作轮播配置（开关 + 间隔秒数，越界回落默认） */
  setRotationConfig(config: MotionRotationConfig): void {
    const seconds = Math.round(config.seconds);
    this.rotationConfig = {
      enabled: config.enabled,
      seconds:
        Number.isFinite(seconds) &&
        seconds >= MOTION_ROTATION_SECONDS_MIN &&
        seconds <= MOTION_ROTATION_SECONDS_MAX
          ? seconds
          : MOTION_ROTATION_SECONDS_DEFAULT,
    };
  }

  /** 推进 mixer 时间轴（每帧 Step 1） */
  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** 到点随机换一个待机动作（手势/长按期间跳过，避免打断） */
  tickRotation(dt: number): void {
    if (!this.rotationConfig.enabled || this.entries.length < 2) return;
    if (this.gestureAction || this.hold.isHolding) {
      this.rotationElapsed = 0;
      return;
    }
    this.rotationElapsed += dt;
    if (this.rotationElapsed >= this.rotationConfig.seconds) {
      this.rotationElapsed = 0;
      this.rotateIdleMotion();
    }
  }

  /** 从条目池随机换一个 ≠ 当前的待机动作；手势/长按中不打断，返回是否切换成功 */
  rotateIdleMotion(): boolean {
    if (this.gestureAction || this.hold.isHolding) return false;
    const candidates = this.entries.filter((entry) => entry !== this.currentIdleEntry);
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    const current = this.currentIdleAction;
    if (!next || !current) return false;

    this.currentIdleAction = crossFadeLoopAction(this.mixer, current, entryLoopClip(next), 0.4, true);
    this.currentIdleEntry = next;
    return true;
  }

  /** 从条目池随机播一条一次性动作；池空（且无内嵌 tap clip）时返回 false 交给调用方回落 */
  playRandomGesture(): boolean {
    const entry = this.entries[Math.floor(Math.random() * this.entries.length)] ?? null;
    const clip = entry?.loopClip ?? this.tapClip;
    return clip ? this.playGestureOnce(clip) : false;
  }

  // ======= v2.2 M1：长按三段式（A → B → C，委托 HoldMotionScheduler） =======

  /** 进入长按：播入场段 A（缺 A 直接进循环段）；手势播放中不打断，返回是否真的开始 */
  beginHoldMotion(rng: () => number = Math.random): boolean {
    if (this.gestureAction) return false;
    return this.hold.begin(rng);
  }

  /** 松手：播退场段 C（缺 C 直接回待机） */
  endHoldMotion(): void {
    this.hold.end();
  }

  /** fitVrmToCamera 之前调：采样**动作池里每一条 clip** 全程包围盒并集返回给 fit 取景 */
  primeForFit(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    const prevAction = this.currentIdleAction;
    prevAction?.stop();
    const bounds = sampleAnimatedBounds(this.mixer, this.vrm, allEntryClips(this.entries));
    if (prevAction) {
      prevAction.reset();
      prevAction.setLoop(THREE.LoopRepeat, Infinity);
      prevAction.play();
    }
    return bounds;
  }

  dispose(): void {
    this.mixer.removeEventListener('finished', this.onActionFinished);
    this.mixer.stopAllAction();
  }

  /** 初始待机：循环播条目的循环段 */
  private startIdleLoop(entry: MotionEntry): void {
    this.currentIdleAction = startLoopAction(this.mixer, entryLoopClip(entry));
    this.currentIdleEntry = entry;
  }

  /** 一次性 action 播完的回调：手势回待机 / 长按段交给调度器 */
  private readonly onActionFinished = (event: { action?: THREE.AnimationAction }): void => {
    const action = event.action;
    if (!action) return;
    if (action === this.gestureAction) {
      this.returnToIdle(action);
      return;
    }
    this.hold.handleFinished(action);
  };

  /** 从条目池播一次手势；播完由 onActionFinished 回到待机 */
  private playGestureOnce(clip: THREE.AnimationClip): boolean {
    const from = this.currentIdleAction;
    const action = this.mixer.clipAction(clip);
    const isCurrentIdle = action === from;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.play();
    // 与待机交叉淡入（复用同一个 action 时无需淡入）
    if (!isCurrentIdle && from) from.crossFadeTo(action, 0.25, false);
    if (isCurrentIdle) this.currentIdleAction = action;
    this.gestureAction = action;
    return true;
  }

  /** 从一次性 action 回到待机循环 */
  private returnToIdle(from: THREE.AnimationAction | null): void {
    this.gestureAction = null;
    const idle = this.currentIdleAction;
    if (!idle) {
      from?.fadeOut(0.3);
      return;
    }
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.setEffectiveWeight(1);
    idle.play();
    if (!from) return;
    if (from === idle) {
      // 手势/长按复用了待机 action：直接恢复循环即可
      idle.clampWhenFinished = false;
      return;
    }
    from.crossFadeTo(idle, 0.4, false);
  }
}
