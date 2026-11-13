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
  type ScriptPropAction,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { LOOK_DIRECTIONS } from '../../animation';
import { PROPS } from '../../vrm/props/prop-manifest';
import type { CueLogEntry, CueSink, SceneEndReason } from '../director';

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
  /** P8：停止剧本动作专用槽（按 id 匹配，避免抢停其他场景的循环动作） */
  stopScriptMotion?(motion?: string): boolean;
  /** M0c：L3 分层行为（behavior.*），由动效库推进 enter/loop/exit */
  playBehavior?(behavior: string): boolean;
  /** 场景 cue：强制接管并清空队列，避免连续点击/场景拥塞 */
  playBehaviorNow?(behavior: string): boolean;
  /** P3：场景结束时停行为，让 loop 阶段进入 exit 回待机 */
  stopBehavior?(behavior?: string, clearQueue?: boolean): boolean;
  /** S3：手持道具 attach/detach（id 由 prop-manifest 白名单校验） */
  attachProp?(id: string, on?: boolean): Promise<boolean>;
  /** S4：场景道具 show/hide */
  showProp?(id: string, on?: boolean): Promise<boolean>;
  /** T2.5：坐姿锚点（null 恢复站立）；缺失时跳过 */
  setSeat?(mode: 'sill' | 'desk' | null): void;
}

/** pose 预设 → 现有控制器调用（T0.5 的场景常量引用这些 id） */
export interface PosePresetActions {
  squash?: boolean;
  tap?: boolean;
  sleeping?: boolean;
  faceAway?: boolean;
  /** 坐窗沿 / 坐桌沿 / 站起 */
  seat?: 'sill' | 'desk' | null;
}

export const BUILTIN_POSE_PRESETS: Readonly<Record<string, PosePresetActions>> = {
  squash: { squash: true },
  tap: { tap: true },
  sleep: { sleeping: true },
  wake: { sleeping: false },
  'face-away': { faceAway: true },
  'face-front': { faceAway: false },
  'sit-sill': { seat: 'sill' },
  'sit-desk': { seat: 'desk' },
  stand: { seat: null },
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

export class VrmCueAdapter implements CueSink {
  /** P3：场景 → 最近一次启动的行为；场景结束/被打断时据此停行为 */
  private readonly behaviorByScene = new Map<string, string>();
  /** 坐姿场景：结束/被打断时恢复站立，避免停在半空坐姿 */
  private readonly seatScenes = new Set<string>();
  /** S3：场景 → 已挂载道具；场景结束/被打断时按本场景清理 */
  private readonly propScenes = new Map<string, Set<string>>();
  /** P8：场景 → 最近一次剧本动作；场景结束/被打断时停循环动作 */
  private readonly motionByScene = new Map<string, string>();

  constructor(private readonly options: VrmCueAdapterOptions) {}

  /** 场景结束（complete/preempt/cancel）：停掉本场景启动的行为与道具 */
  end(sceneId: string, _reason: SceneEndReason): void {
    if (this.seatScenes.delete(sceneId)) this.options.controller.setSeat?.(null);
    const props = this.propScenes.get(sceneId);
    if (props) {
      this.propScenes.delete(sceneId);
      for (const id of props) {
        // 另一个场景仍在使用同一道具时不抢卸
        if ([...this.propScenes.values()].some((set) => set.has(id))) continue;
        const spec = PROPS[id];
        if (spec?.kind === 'stage') void this.options.controller.showProp?.(id, false);
        else void this.options.controller.attachProp?.(id, false);
      }
    }
    const motion = this.motionByScene.get(sceneId);
    if (motion) {
      this.motionByScene.delete(sceneId);
      // 另一个场景仍在使用同一动作时不抢停
      if (![...this.motionByScene.values()].includes(motion)) {
        this.options.controller.stopScriptMotion?.(motion);
      }
    }
    const behavior = this.behaviorByScene.get(sceneId);
    if (!behavior) return;
    this.behaviorByScene.delete(sceneId);
    // 另一个场景仍在使用同一个行为时不抢停
    for (const other of this.behaviorByScene.values()) if (other === behavior) return;
    this.options.controller.stopBehavior?.(behavior, true);
  }

  execute(entry: CueLogEntry, random: () => number): void {
    const { cue } = entry;
    switch (cue.kind) {
      case 'pose':
        this.applyPreset(cue.preset, entry.sceneId);
        break;
      case 'gesture':
        this.gesture(cue.gesture, cue.intensity);
        break;
      case 'motion':
        this.motion(cue.motion, cue.loop, cue.fadeMs, entry.sceneId);
        break;
      case 'behavior':
        this.behavior(cue.behavior, entry.sceneId);
        break;
      case 'prop':
        this.prop(cue.prop, cue.action, entry.sceneId);
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

  private applyPreset(id: string, sceneId: string): void {
    const preset = this.options.presets?.[id] ?? BUILTIN_POSE_PRESETS[id];
    if (!preset) {
      console.warn('[VrmCueAdapter] 未知 pose 预设:', id);
      return;
    }
    const target = this.options.controller;
    if (preset.sleeping !== undefined) target.setSleeping?.(preset.sleeping);
    if (preset.faceAway !== undefined) target.setFaceAway?.(preset.faceAway);
    if (preset.seat !== undefined) {
      target.setSeat?.(preset.seat);
      if (preset.seat === null) this.seatScenes.delete(sceneId);
      else this.seatScenes.add(sceneId);
    }
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

  private motion(motion: string, loop: boolean | undefined, fadeMs: number | undefined, sceneId: string): void {
    if (!this.options.controller.playMotion?.(motion, { loop, fadeMs })) {
      console.warn('[VrmCueAdapter] 控制器无指定动作能力，跳过:', motion);
      return;
    }
    this.motionByScene.set(sceneId, motion);
  }

  private behavior(behavior: string, sceneId: string): void {
    const controller = this.options.controller;
    if (!controller.playBehaviorNow?.(behavior) && !controller.playBehavior?.(behavior)) {
      console.warn('[VrmCueAdapter] 控制器无分层行为能力，跳过:', behavior);
      return;
    }
    this.behaviorByScene.set(sceneId, behavior);
  }

  /** S3/S4：手持道具 attach/detach，场景道具 show/hide；动作与 kind 必须匹配 */
  private prop(id: string, action: ScriptPropAction, sceneId: string): void {
    const spec = PROPS[id];
    if (!spec) {
      console.warn('[VrmCueAdapter] 未登记道具，跳过:', id);
      return;
    }
    const stage = action === 'show' || action === 'hide';
    if (stage !== (spec.kind === 'stage')) {
      console.warn('[VrmCueAdapter] 道具动作与类型不匹配，跳过:', id, action);
      return;
    }
    const controller = this.options.controller;
    const apply = spec.kind === 'stage' ? controller.showProp : controller.attachProp;
    if (!apply) {
      console.warn('[VrmCueAdapter] 控制器无对应道具能力，跳过:', id, action);
      return;
    }
    const on = action === 'attach' || action === 'show';
    void apply.call(controller, id, on);
    const props = this.propScenes.get(sceneId) ?? new Set<string>();
    if (on) props.add(id);
    else props.delete(id);
    if (props.size > 0) this.propScenes.set(sceneId, props);
    else this.propScenes.delete(sceneId);
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
    const [x, y] = LOOK_DIRECTIONS[target];
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
