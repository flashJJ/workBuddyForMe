/**
 * v3.0 剧本引擎 T0.4：VRM 适配器。
 *
 * 把 Director 的 cue 映射到现有 VrmController 公开能力（零改动控制器）：
 * pose → squash/tap 预设，expression → flashExpression，look → setGaze，line/speak → 字幕/TTS。
 * 控制器尚未提供的程序化手势 / 指定动作走可选方法，缺失时 warn 跳过，不中断整场。
 */

import {
  pickPetLine,
  type ExpressionTag,
  type PetLinePoolId,
  type ScriptGesture,
  type ScriptLookTarget,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { CueLogEntry, CueSink } from '../director';

/** 适配器实际用到的最小控制器能力（VrmController 结构兼容） */
export interface VrmCueTarget {
  playSquash?(): void;
  tap?(): void;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
  setExpression?(tag: ExpressionTag): void;
  setGaze?(nx: number, ny: number): void;
  setSleeping?(sleeping: boolean): void;
  setFaceAway?(away: boolean): void;
  playGesture?(gesture: ScriptGesture, intensity?: number): boolean;
  playMotion?(motion: string, options?: { loop?: boolean; fadeMs?: number }): boolean;
  /** M0c：L3 分层行为（behavior.*），由动效库推进 enter/loop/exit */
  playBehavior?(behavior: string): boolean;
}

/** pose 预设 → 现有控制器调用（T0.5 的场景常量引用这些 id） */
export interface PosePresetActions {
  squash?: boolean;
  tap?: boolean;
  sleeping?: boolean;
  faceAway?: boolean;
}

export const BUILTIN_POSE_PRESETS: Readonly<Record<string, PosePresetActions>> = {
  squash: { squash: true },
  tap: { tap: true },
  sleep: { sleeping: true },
  wake: { sleeping: false },
  'face-away': { faceAway: true },
  'face-front': { faceAway: false },
};

export const DEFAULT_EXPRESSION_HOLD_MS = 2000;
export const DEFAULT_LINE_MS = 3200;

export interface VrmCueAdapterOptions {
  controller: VrmCueTarget;
  /** 字幕气泡（i18n key，与旧 executor 的 showSubtitle 同口径） */
  showSubtitle?: (key: MessageKey, durationMs?: number) => void;
  /** 指定文案发声（TTS 队列），缺省时 pool speak 回退到字幕 */
  speakText?: (text: string, tts: boolean) => void;
  /** look target=pointer 时的归一化坐标来源（-1..1） */
  getPointer?: () => { x: number; y: number } | null;
  /** 覆盖/扩展内置 pose 预设 */
  presets?: Readonly<Record<string, PosePresetActions>>;
}

const LOOK_COORDS: Readonly<Record<ScriptLookTarget, readonly [number, number]>> = {
  camera: [0, 0],
  pointer: [0, 0],
  away: [0.7, 0],
  up: [0, -1],
  down: [0, 1],
};

export class VrmCueAdapter implements CueSink {
  constructor(private readonly options: VrmCueAdapterOptions) {}

  execute(entry: CueLogEntry, random: () => number): void {
    const { cue } = entry;
    switch (cue.kind) {
      case 'pose':
        this.applyPreset(cue.preset);
        break;
      case 'gesture':
        this.gesture(cue.gesture, cue.intensity);
        break;
      case 'motion':
        this.motion(cue.motion, cue.loop, cue.fadeMs);
        break;
      case 'behavior':
        this.behavior(cue.behavior);
        break;
      case 'expression':
        this.expression(cue.tag, cue.holdMs);
        break;
      case 'look':
        this.look(cue.target, cue.weight);
        break;
      case 'line':
        this.line(cue.pool, cue.ms, random);
        break;
      case 'speak':
        this.speak(cue.text, cue.pool, cue.tts, random);
        break;
      default:
        // wait/branch 由 Director 展开；sound/effect/move/emit 在 M0 被 Director 过滤
        console.warn('[VrmCueAdapter] 未实现的 cue:', cue.kind);
    }
  }

  private applyPreset(id: string): void {
    const preset = this.options.presets?.[id] ?? BUILTIN_POSE_PRESETS[id];
    if (!preset) {
      console.warn('[VrmCueAdapter] 未知 pose 预设:', id);
      return;
    }
    const target = this.options.controller;
    if (preset.sleeping !== undefined) target.setSleeping?.(preset.sleeping);
    if (preset.faceAway !== undefined) target.setFaceAway?.(preset.faceAway);
    if (preset.squash) target.playSquash?.();
    if (preset.tap) target.tap?.();
  }

  /** holdMs=0 对应旧 executor 的 setExpression（常驻），否则走临时表情 */
  private expression(tag: ExpressionTag, holdMs?: number): void {
    if (holdMs === 0) {
      this.options.controller.setExpression?.(tag);
      return;
    }
    this.options.controller.flashExpression(tag, holdMs ?? DEFAULT_EXPRESSION_HOLD_MS);
  }

  private gesture(gesture: ScriptGesture, intensity?: number): void {
    if (this.options.controller.playGesture?.(gesture, intensity)) return;
    console.warn('[VrmCueAdapter] 控制器无程序化手势能力，跳过:', gesture);
  }

  private motion(motion: string, loop?: boolean, fadeMs?: number): void {
    if (this.options.controller.playMotion?.(motion, { loop, fadeMs })) return;
    console.warn('[VrmCueAdapter] 控制器无指定动作能力，跳过:', motion);
  }

  private behavior(behavior: string): void {
    if (this.options.controller.playBehavior?.(behavior)) return;
    console.warn('[VrmCueAdapter] 控制器无分层行为能力，跳过:', behavior);
  }

  private look(target: ScriptLookTarget, weight = 1): void {
    const controller = this.options.controller;
    if (!controller.setGaze) return;
    if (target === 'pointer') {
      const pointer = this.options.getPointer?.();
      if (pointer) {
        controller.setGaze(pointer.x * weight, pointer.y * weight);
        return;
      }
    }
    const [x, y] = LOOK_COORDS[target];
    controller.setGaze(x * weight, y * weight);
  }

  private line(pool: PetLinePoolId, ms: number | undefined, random: () => number): void {
    this.options.showSubtitle?.(pickPetLine(pool, random()), ms ?? DEFAULT_LINE_MS);
  }

  private speak(
    text: string | undefined,
    pool: PetLinePoolId | undefined,
    tts: boolean | undefined,
    random: () => number,
  ): void {
    if (text) {
      this.options.speakText?.(text, tts ?? true);
      return;
    }
    if (pool) {
      this.line(pool, undefined, random);
      return;
    }
    console.warn('[VrmCueAdapter] speak 缺少 text/pool');
  }
}
