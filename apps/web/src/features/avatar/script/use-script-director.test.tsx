// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { InteractionEvent } from '@wbfm/shared/schemas';
import { useScriptDirector, type ScriptControllerHandle, type ScriptCueContext } from './use-script-director';

function cueCtx(): ScriptCueContext {
  return {
    hour: 12,
    relationshipLevel: 'partner',
    mood: 'normal',
    emotionEnabled: true,
    linesEnabled: true,
    doNotDisturb: { enabled: true, startHour: 23, endHour: 6 },
    busy: false,
    sleeping: false,
    faceAway: false,
  };
}

function setup(enabled = true, strict = false) {
  const calls: string[] = [];
  const subtitles: MessageKey[] = [];
  const controller: ScriptControllerHandle = {
    playSquash: () => calls.push('squash'),
    tap: () => calls.push('tap'),
    flashExpression: (tag) => calls.push(`expression:${tag}`),
  };
  const wrapper = strict
    ? ({ children }: { children: React.ReactNode }) => <React.StrictMode>{children}</React.StrictMode>
    : undefined;
  const hook = renderHook(
    () =>
      useScriptDirector({
        enabled,
        getController: () => controller,
        showSubtitle: (key) => subtitles.push(key),
      }),
    { wrapper },
  );
  return { ...hook, calls, subtitles };
}

describe('useScriptDirector（T0.7 开关接线）', () => {
  it('有场景的触摸事件走 Director，输出视觉 cue 与台词', () => {
    const { result, calls, subtitles } = setup();
    let handled = false;
    const event: InteractionEvent = { kind: 'touch', region: 'head', gesture: 'tap' };
    act(() => {
      handled = result.current.playEvent(event, cueCtx());
    });
    expect(handled).toBe(true);
    expect(calls).toEqual(['squash', 'tap', 'expression:joy']);
    expect(subtitles).toHaveLength(1);
    expect(String(subtitles[0]).startsWith('emotion.touch.blush')).toBe(true);
  });

  it('无场景的事件返回 false，交给旧 Resolver', () => {
    const { result } = setup();
    let handled = true;
    act(() => {
      handled = result.current.playEvent({ kind: 'context', trigger: 'lateNight' }, cueCtx());
    });
    expect(handled).toBe(false);
  });

  it('开关关闭时完全不介入', () => {
    const { result, calls } = setup(false);
    let handled = true;
    act(() => {
      handled = result.current.playEvent(
        { kind: 'touch', region: 'head', gesture: 'tap' },
        cueCtx(),
      );
    });
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('StrictMode 双重 effect 后仍能播放（Director 不被复用为已 dispose 实例）', () => {
    const { result, calls } = setup(true, true);
    let handled = false;
    act(() => {
      handled = result.current.playEvent(
        { kind: 'touch', region: 'head', gesture: 'tap' },
        cueCtx(),
      );
    });
    expect(handled).toBe(true);
    expect(calls).toEqual(['squash', 'tap', 'expression:joy']);
  });

  it('场景存在但被门控拒绝时视为已消费，不回退旧链', () => {
    const { result, calls } = setup();
    let handled = false;
    act(() => {
      handled = result.current.playEvent(
        { kind: 'touch', region: 'raised', gesture: 'tap' },
        { ...cueCtx(), relationshipLevel: 'stranger' },
      );
    });
    expect(handled).toBe(true);
    expect(calls).toEqual([]);
  });
});
