import { describe, expect, it, vi } from 'vitest';
import type { Cue, ExpressionTag, ScriptGesture } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { CueLogEntry } from '../director';
import { BUILTIN_POSE_PRESETS, VrmCueAdapter, type VrmCueTarget } from './vrm-adapter';

class FakeController implements VrmCueTarget {
  calls: string[] = [];
  expression: { tag: ExpressionTag; holdMs: number } | null = null;
  gaze: { x: number; y: number } | null = null;
  gesture: { gesture: ScriptGesture; intensity?: number } | null = null;
  motion: { motion: string; loop?: boolean; fadeMs?: number } | null = null;
  sleeping: boolean | null = null;
  faceAway: boolean | null = null;

  playSquash(): void {
    this.calls.push('squash');
  }

  tap(): void {
    this.calls.push('tap');
  }

  flashExpression(tag: ExpressionTag, holdMs: number): void {
    this.calls.push('expression');
    this.expression = { tag, holdMs };
  }

  setExpression(tag: ExpressionTag): void {
    this.calls.push('setExpression');
    this.expression = { tag, holdMs: 0 };
  }

  setSleeping(sleeping: boolean): void {
    this.calls.push('sleeping');
    this.sleeping = sleeping;
  }

  setFaceAway(away: boolean): void {
    this.calls.push('faceAway');
    this.faceAway = away;
  }

  setGaze(x: number, y: number): void {
    this.calls.push('gaze');
    this.gaze = { x, y };
  }

  playGesture(gesture: ScriptGesture, intensity?: number): boolean {
    this.calls.push('gesture');
    this.gesture = { gesture, intensity };
    return true;
  }

  playMotion(motion: string, options?: { loop?: boolean; fadeMs?: number }): boolean {
    this.calls.push('motion');
    this.motion = { motion, ...options };
    return true;
  }
}

function entryOf(cue: Cue): CueLogEntry {
  return { sceneId: 'test.scene', at: 0, beatAt: 0, track: 'body', cue };
}

function setup(overrides: Partial<ConstructorParameters<typeof VrmCueAdapter>[0]> = {}) {
  const controller = new FakeController();
  const subtitles: Array<{ key: MessageKey; ms?: number }> = [];
  const spoken: Array<{ text: string; tts: boolean }> = [];
  const adapter = new VrmCueAdapter({
    controller,
    showSubtitle: (key, ms) => subtitles.push({ key, ms }),
    speakText: (text, tts) => spoken.push({ text, tts }),
    ...overrides,
  });
  return { controller, adapter, subtitles, spoken };
}

describe('VrmCueAdapter（cue → 现有控制器）', () => {
  it('pose 预设映射 squash / tap，且顺序与预设一致', () => {
    const { controller, adapter } = setup();
    adapter.execute(entryOf({ kind: 'pose', preset: 'squash' }), () => 0);
    adapter.execute(entryOf({ kind: 'pose', preset: 'tap' }), () => 0);
    expect(controller.calls).toEqual(['squash', 'tap']);
    expect(BUILTIN_POSE_PRESETS.squash).toEqual({ squash: true });
    expect(BUILTIN_POSE_PRESETS.tap).toEqual({ tap: true });
  });

  it('状态预设映射 setSleeping / setFaceAway', () => {
    const { controller, adapter } = setup();
    adapter.execute(entryOf({ kind: 'pose', preset: 'sleep' }), () => 0);
    adapter.execute(entryOf({ kind: 'pose', preset: 'wake' }), () => 0);
    adapter.execute(entryOf({ kind: 'pose', preset: 'face-away' }), () => 0);
    adapter.execute(entryOf({ kind: 'pose', preset: 'face-front' }), () => 0);
    expect(controller.calls).toEqual(['sleeping', 'sleeping', 'faceAway', 'faceAway']);
    expect(controller.sleeping).toBe(false);
    expect(controller.faceAway).toBe(false);
  });

  it('未知 pose 预设 warn 后跳过，不影响后续 cue', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { controller, adapter } = setup();
    adapter.execute(entryOf({ kind: 'pose', preset: 'missing' }), () => 0);
    adapter.execute(entryOf({ kind: 'pose', preset: 'tap' }), () => 0);
    expect(warn).toHaveBeenCalled();
    expect(controller.calls).toEqual(['tap']);
    warn.mockRestore();
  });

  it('expression 使用 holdMs，缺省回落 2000ms；holdMs=0 走常驻表情', () => {
    const { controller, adapter } = setup();
    adapter.execute(entryOf({ kind: 'expression', tag: 'joy', holdMs: 2600 }), () => 0);
    adapter.execute(entryOf({ kind: 'expression', tag: 'smirk' }), () => 0);
    adapter.execute(entryOf({ kind: 'expression', tag: 'smirk', holdMs: 0 }), () => 0);
    expect(controller.calls).toEqual(['expression', 'expression', 'setExpression']);
    expect(controller.expression).toEqual({ tag: 'smirk', holdMs: 0 });
  });

  it('look 目标映射归一化坐标，pointer 支持外部坐标与权重', () => {
    const { controller, adapter } = setup({ getPointer: () => ({ x: 0.5, y: -0.5 }) });
    adapter.execute(entryOf({ kind: 'look', target: 'camera' }), () => 0);
    expect(controller.gaze).toEqual({ x: 0, y: 0 });
    adapter.execute(entryOf({ kind: 'look', target: 'up' }), () => 0);
    expect(controller.gaze).toEqual({ x: 0, y: -1 });
    adapter.execute(entryOf({ kind: 'look', target: 'down', weight: 0.5 }), () => 0);
    expect(controller.gaze).toEqual({ x: 0, y: 0.5 });
    adapter.execute(entryOf({ kind: 'look', target: 'pointer', weight: 0.5 }), () => 0);
    expect(controller.gaze).toEqual({ x: 0.25, y: -0.25 });
    adapter.execute(entryOf({ kind: 'look', target: 'away' }), () => 0);
    expect(controller.gaze).toEqual({ x: 0.7, y: 0 });
  });

  it('line 用注入随机选池内词条，ms 缺省 3200', () => {
    const { adapter, subtitles } = setup();
    adapter.execute(entryOf({ kind: 'line', pool: 'head-tap' }), () => 0);
    adapter.execute(entryOf({ kind: 'line', pool: 'head-tap', ms: 1000 }), () => 0);
    expect(subtitles).toEqual([
      { key: 'emotion.touch.blush0', ms: 3200 },
      { key: 'emotion.touch.blush0', ms: 1000 },
    ]);
  });

  it('speak 优先用 text 发声；只有 pool 时回退字幕', () => {
    const { adapter, spoken, subtitles } = setup();
    adapter.execute(entryOf({ kind: 'speak', text: '欢迎回来' }), () => 0);
    adapter.execute(entryOf({ kind: 'speak', text: '晚安', tts: false }), () => 0);
    adapter.execute(entryOf({ kind: 'speak', pool: 'cheer' }), () => 0);
    expect(spoken).toEqual([
      { text: '欢迎回来', tts: true },
      { text: '晚安', tts: false },
    ]);
    expect(subtitles).toHaveLength(1);
  });

  it('gesture / motion 走控制器可选能力', () => {
    const { controller, adapter } = setup();
    adapter.execute(entryOf({ kind: 'gesture', gesture: 'tilt', intensity: 0.6 }), () => 0);
    adapter.execute(entryOf({ kind: 'motion', motion: 'motion:wave.vrma', loop: true, fadeMs: 200 }), () => 0);
    expect(controller.gesture).toEqual({ gesture: 'tilt', intensity: 0.6 });
    expect(controller.motion).toEqual({ motion: 'motion:wave.vrma', loop: true, fadeMs: 200 });
  });

  it('控制器缺少手势/动作能力时 warn 跳过，不抛错', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = setup({
      controller: {
        flashExpression: () => {},
      },
    });
    expect(() => {
      adapter.execute(entryOf({ kind: 'gesture', gesture: 'nod' }), () => 0);
      adapter.execute(entryOf({ kind: 'motion', motion: 'motion:none.vrma' }), () => 0);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('M0 保留 cue 即使被误传也只 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = setup();
    adapter.execute(entryOf({ kind: 'sound', sound: 'chime' }), () => 0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
