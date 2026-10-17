import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  MOTION_ROTATION_SECONDS_DEFAULT,
  MOTION_ROTATION_SECONDS_MAX,
  MOTION_ROTATION_SECONDS_MIN,
} from '@wbfm/shared/constants';
import { computeAnimatedBounds } from './animated-bounds';

/** Tap clip 单次播放的轨道名匹配模式（中英文都覆盖） */
const TAP_CLIP_PATTERNS = /tap|click|hit|touch|poke|点击|挥|摆/i;
/** Idle clip 循环播放的轨道名匹配模式（覆盖中文「默认」「待机N」） */
const IDLE_CLIP_PATTERNS = /idle|loop|standby|待\s*机|默认|待机\d|アイドル|ポーズ/i;

/** 待机动作轮播配置 */
export interface MotionRotationConfig {
  enabled: boolean;
  seconds: number;
}

interface SelectClipResult {
  idleClip: THREE.AnimationClip | null;
  tapClip: THREE.AnimationClip | null;
}

/**
 * 动作池 + 单 mixer 协作者（由 VrmController 外迁）。
 *
 * 动作模型：**单一 mixer + 动作池**。
 * - 动作池 = 内置 daiji + 全部已导入 VRMA（由 vrm-canvas 的 loadMotionPool 组装）。
 * - `idleClip` 是池内当前循环播放的那一条；`rotateIdleMotion()` 随机换一条（crossFade）。
 * - `playRandomGesture()` 从池里随机播一条一次性 clip（LoopOnce → 播完回待机）。
 *   只用单 mixer 是必须的：两个 mixer 会争同一批 normalized bone，权重无法混合。
 *
 * 本类只负责「哪条 clip 在播」，不碰骨骼叠加层与表情层（那由 VrmPoseLayer / VrmFaceLayer 管）。
 */
export class MotionMixer {
  private readonly vrm: VRM;
  private readonly mixer: THREE.AnimationMixer;
  /** 动作池（初始待机排首位）；空池时退回模型内嵌 clip / 程序化姿态 */
  private readonly motionPool: THREE.AnimationClip[];
  private readonly tapClip: THREE.AnimationClip | null;
  private idleClip: THREE.AnimationClip | null = null;
  /** 当前循环播放的待机 action */
  private currentIdleAction: THREE.AnimationAction | null = null;
  /** 正在播的一次性手势 action（非 null 时不打断轮播） */
  private gestureAction: THREE.AnimationAction | null = null;
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
    motionPool?: THREE.AnimationClip[] | null,
    rotationConfig?: MotionRotationConfig | null,
  ) {
    this.vrm = vrm;
    // 单 mixer：优先复用 three-vrm 自带的（已绑定正确的 root）
    const existing = (vrm as unknown as { animationMixer?: THREE.AnimationMixer }).animationMixer;
    const root = vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
    this.mixer = existing ?? new THREE.AnimationMixer(root);
    this.mixer.addEventListener('finished', this.onGestureFinished);
    if (rotationConfig) this.setRotationConfig(rotationConfig);

    const selected = this.selectClips(gltfAnimations ?? []);
    this.tapClip = selected.tapClip;
    this.motionPool = (motionPool ?? []).filter((clip) => Boolean(clip));

    // 初始待机：动作池首位 > 模型内嵌 idle clip > 程序化
    const primary = this.motionPool[0] ?? selected.idleClip;
    if (primary) {
      this.idleClip = primary;
      const action = this.mixer.clipAction(primary);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      this.currentIdleAction = action;
    }
  }

  /** 是否无任何 clip 可用（VrmController 据此走程序化姿态） */
  get usesProceduralPose(): boolean {
    return this.idleClip === null;
  }

  /** 动作池大小 */
  get poolSize(): number {
    return this.motionPool.length;
  }

  /** 当前待机 clip 名（调试钩子用） */
  get idleClipName(): string | null {
    return this.idleClip?.name ?? null;
  }

  /** 是否正在播一次性手势 */
  get hasGesture(): boolean {
    return this.gestureAction !== null;
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

  /** 到点随机换一个待机动作（手势播放中跳过，避免打断） */
  tickRotation(dt: number): void {
    if (!this.rotationConfig.enabled || this.motionPool.length < 2) return;
    if (this.gestureAction) {
      this.rotationElapsed = 0;
      return;
    }
    this.rotationElapsed += dt;
    if (this.rotationElapsed >= this.rotationConfig.seconds) {
      this.rotationElapsed = 0;
      this.rotateIdleMotion();
    }
  }

  /** 从动作池随机换一个 ≠ 当前的待机动作；手势播放中不打断，返回是否切换成功 */
  rotateIdleMotion(): boolean {
    if (this.gestureAction) return false;
    const candidates = this.motionPool.filter((clip) => clip !== this.idleClip);
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    const current = this.currentIdleAction;
    if (!next || !current) return false;

    const nextAction = this.mixer.clipAction(next);
    nextAction.reset();
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.setEffectiveWeight(1);
    nextAction.play();
    current.crossFadeTo(nextAction, 0.4, true);

    this.currentIdleAction = nextAction;
    this.idleClip = next;
    return true;
  }

  /** 从动作池随机播一条一次性动作；池空（且无内嵌 tap clip）时返回 false 交给调用方回落 */
  playRandomGesture(): boolean {
    const clip = this.motionPool[Math.floor(Math.random() * this.motionPool.length)] ?? this.tapClip;
    return clip ? this.playGestureOnce(clip) : false;
  }

  /**
   * fitVrmToCamera 之前调：遍历**动作池里每一条 clip** 采样全程包围盒并集返回给 fit 取景。
   *
   * 关键：不能只按「某一条」或「某一帧」的包围盒取景——轮播会比到摆幅更大的动作，
   * 那时按别的动作算出的 scale 会让四肢超出视锥被裁。
   * 为控耗时，每条 clip 按时长占比分配采样帧，并设总采样帧数上限。
   */
  primeForFit(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    const step = 1 / 60;
    const MAX_SAMPLES = 900;
    let acc: THREE.Box3 | null = null;
    const sample = () => {
      const b = computeAnimatedBounds(this.vrm.scene);
      if (!b.isEmpty()) acc = acc ? acc.union(b) : b;
    };

    const clips = this.motionPool.length > 0
      ? this.motionPool
      : this.idleClip ? [this.idleClip] : [];

    if (clips.length > 0) {
      const prevAction = this.currentIdleAction;
      prevAction?.stop();
      const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
      for (const clip of clips) {
        const action = this.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.setEffectiveWeight(1);
        action.play();
        const full = Math.max(12, Math.ceil(clip.duration / step));
        const share =
          totalDuration > 0
            ? Math.round((clip.duration / totalDuration) * MAX_SAMPLES)
            : MAX_SAMPLES;
        const frames = Math.max(12, Math.min(full, share));
        const delta = clip.duration / frames;
        for (let i = 0; i < frames; i++) {
          this.mixer.update(delta);
          this.vrm.update(delta);
          sample();
        }
        action.stop();
      }
      if (prevAction) {
        prevAction.reset();
        prevAction.setLoop(THREE.LoopRepeat, Infinity);
        prevAction.play();
      }
    } else {
      for (let i = 0; i < 120; i++) {
        this.vrm.update(step);
        sample();
      }
    }

    if (!acc) return null;
    const box = acc as THREE.Box3;
    return { min: box.min.clone(), max: box.max.clone() };
  }

  dispose(): void {
    this.mixer.removeEventListener('finished', this.onGestureFinished);
    this.mixer.stopAllAction();
  }

  private selectClips(clips: THREE.AnimationClip[]): SelectClipResult {
    if (clips.length === 0) return { idleClip: null, tapClip: null };
    const idleClip =
      clips.find((c) => IDLE_CLIP_PATTERNS.test(c.name)) ??
      [...clips].sort((a, b) => b.duration - a.duration)[0] ?? null;
    const tapClip = clips.find((c) => TAP_CLIP_PATTERNS.test(c.name)) ?? null;
    return { idleClip, tapClip };
  }

  /** 手势播完的事件回调：回到待机循环 */
  private readonly onGestureFinished = (event: { action?: THREE.AnimationAction }): void => {
    if (!this.gestureAction || event.action !== this.gestureAction) return;
    this.returnToIdle();
  };

  /** 用同一个 mixer 播一次一次性 clip；播完由 onGestureFinished 回到待机 */
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

  /** 一次性手势播完 → 回到待机循环 */
  private returnToIdle(): void {
    const gesture = this.gestureAction;
    this.gestureAction = null;
    const idle = this.currentIdleAction;
    if (!idle) {
      gesture?.fadeOut(0.3);
      return;
    }
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.setEffectiveWeight(1);
    idle.play();
    if (!gesture) return;
    if (gesture === idle) {
      // 手势复用了待机 action：直接恢复循环即可
      idle.clampWhenFinished = false;
      return;
    }
    gesture.crossFadeTo(idle, 0.4, false);
  }
}
