import * as THREE from 'three';
import {
  entryEndClip,
  entryLoopClip,
  pickHoldEntry,
  type MotionEntry,
} from './motion-segments';
import { crossFadeLoopAction, playOnceAction } from './motion-clips';

/** 长按动作的当前段（start=A / loop=B / end=C） */
type HoldPhase = 'start' | 'loop' | 'end';

/** 长按调度器向宿主（MotionMixer）索要的能力 */
export interface HoldHost {
  mixer: THREE.AnimationMixer;
  entries: MotionEntry[];
  /** 当前待机 action（用于 A 段起播时的淡入与回待机） */
  getIdleAction(): THREE.AnimationAction | null;
  /** 一次性动作播完/缺 C 段时回待机循环 */
  returnToIdle(from: THREE.AnimationAction | null): void;
}

/**
 * 长按三段式调度（A → B → C），由 MotionMixer 外迁。
 *
 * 语义（契约 docs/plan/v2.2/02）：
 * - 长按进入 → 播入场段 A；缺 A 直接进循环段；
 * - A 播完 → 进循环段 B（LoopRepeat 维持，不重开，对应 `interaction.loop` 延长）；
 * - 松手 → 播退场段 C；缺 C 直接回待机；C 播完回待机。
 */
export class HoldMotionScheduler {
  private entry: MotionEntry | null = null;
  private action: THREE.AnimationAction | null = null;
  private phase: HoldPhase | null = null;

  constructor(private readonly host: HoldHost) {}

  get isHolding(): boolean {
    return this.entry !== null;
  }

  /** 当前段 action（A/B/C；用于「当前在播 clip」调试与测试） */
  get currentAction(): THREE.AnimationAction | null {
    return this.action;
  }

  /** 进入长按：播入场段 A（缺 A 直接进循环段）；返回是否真的开始 */
  begin(rng: () => number = Math.random): boolean {
    if (this.entry) return false;
    const entry = pickHoldEntry(this.host.entries, rng);
    if (!entry) return false;

    this.entry = entry;
    const startClip = entry.clips.a_start;
    if (startClip) {
      this.phase = 'start';
      this.action = playOnceAction(this.host.mixer, startClip, this.host.getIdleAction());
    } else {
      this.enterLoop();
    }
    return true;
  }

  /** 松手：播退场段 C（缺 C 直接回待机） */
  end(): void {
    const entry = this.entry;
    if (!entry) return;
    const endClip = entryEndClip(entry);
    if (!endClip) {
      this.finish();
      return;
    }
    this.phase = 'end';
    this.action = playOnceAction(
      this.host.mixer,
      endClip,
      this.action ?? this.host.getIdleAction(),
    );
  }

  /** 处理一次性 action 播完事件（A 完进 B、C 完回待机） */
  handleFinished(action: THREE.AnimationAction): void {
    if (!this.entry || action !== this.action) return;
    if (this.phase === 'start') this.enterLoop();
    else if (this.phase === 'end') this.finish();
  }

  /** A 段播完 → 进循环段 B（LoopRepeat 维持，不重开） */
  private enterLoop(): void {
    const entry = this.entry;
    if (!entry) return;
    const loopClip = entryLoopClip(entry);
    const from = this.action ?? this.host.getIdleAction();
    // A 段即循环段（single）：沿用同一 action，改成循环维持
    if (from && from.getClip() === loopClip) {
      from.setLoop(THREE.LoopRepeat, Infinity);
      this.action = from;
      this.phase = 'loop';
      return;
    }
    this.action = crossFadeLoopAction(this.host.mixer, from, loopClip, 0.3);
    this.phase = 'loop';
  }

  /** C 段播完（或缺 C）→ 回待机循环；清空长按状态 */
  private finish(): void {
    const from = this.action;
    this.entry = null;
    this.action = null;
    this.phase = null;
    this.host.returnToIdle(from);
  }
}
