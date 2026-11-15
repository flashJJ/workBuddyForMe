// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { InteractionEvent, Scene } from '@wbfm/shared/schemas';
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

function setup(enabled = true, strict = false, withBehavior = false) {
  const calls: string[] = [];
  const subtitles: MessageKey[] = [];
  const controller: ScriptControllerHandle = {
    playSquash: () => calls.push('squash'),
    tap: () => calls.push('tap'),
    flashExpression: (tag) => calls.push(`expression:${tag}`),
    ...(withBehavior
      ? {
          playBehavior: (behavior: string) => {
            calls.push(`behavior:${behavior}`);
            return true;
          },
          playBehaviorNow: (behavior: string) => {
            calls.push(`behaviorNow:${behavior}`);
            return true;
          },
          stopBehavior: (behavior?: string, clearQueue?: boolean) => {
            calls.push(`stop:${behavior ?? '-'}:${String(clearQueue)}`);
            return true;
          },
        }
      : {}),
    setSeat: (mode) => calls.push(`seat:${String(mode)}`),
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
    expect(calls).toEqual(['squash', 'expression:joy']);
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
    expect(calls).toEqual(['squash', 'expression:joy']);
  });

  it('playScene 手动播放无触发键的场戏', () => {
    const { result, calls, subtitles } = setup();
    let played = false;
    act(() => {
      played = result.current.playScene('moment.eat-rice');
    });
    expect(played).toBe(true);
    // mock 无 setGaze/playBehavior，只有表情与台词通道生效
    expect(calls).toEqual(['expression:joy']);
    expect(subtitles).toHaveLength(1);
    expect(String(subtitles[0]).startsWith('emotion.eatRice')).toBe(true);
  });

  it('playScene 走坐姿预设：进入坐姿并在场戏结束时站起', () => {
    const { result, calls } = setup();
    let played = false;
    act(() => {
      played = result.current.playScene('moment.sit-sill');
    });
    expect(played).toBe(true);
    expect(calls).toContain('seat:sill');

    act(() => result.current.onFrame(6000));
    expect(calls).toContain('seat:null');
  });

  it('场景存在但被门控拒绝时视为已消费，不回退旧链', () => {
    const { result, calls } = setup();
    let handled = false;
    act(() => {
      handled = result.current.playEvent(
        { kind: 'touch', region: 'head', gesture: 'longpress' },
        { ...cueCtx(), relationshipLevel: 'stranger' },
      );
    });
    expect(handled).toBe(true);
    expect(calls).toEqual([]);
  });

  it('同一触发键轮换候选场戏：第二次身体单击切到鞠躬', () => {
    const { result, calls } = setup(true, false, true);
    const event: InteractionEvent = { kind: 'touch', region: 'body', gesture: 'tap' };
    act(() => {
      expect(result.current.playEvent(event, cueCtx())).toBe(true);
    });
    const afterFirst = calls.length;
    expect(calls).not.toContain('behaviorNow:behavior.bow');
    act(() => {
      expect(result.current.playEvent(event, cueCtx())).toBe(true);
    });
    expect(calls.slice(afterFirst)).toContain('behaviorNow:behavior.bow');
  });

  it('场景行为强制接管，场景结束按 id 停行为并清空队列', () => {
    const { result, calls } = setup(true, false, true);
    act(() => {
      expect(result.current.playScene('moment.bow')).toBe(true);
    });
    expect(calls).toContain('behaviorNow:behavior.bow');
    act(() => result.current.onFrame(3000));
    expect(calls).toContain('stop:behavior.bow:true');
  });

  it('extraScenes 进入触发键索引：生成场景也能被真实事件触发', () => {
    const calls: string[] = [];
    const controller: ScriptControllerHandle = {
      playSquash: () => calls.push('squash'),
      flashExpression: (tag) => calls.push(`expression:${tag}`),
    };
    const generated: Scene = {
      id: 'gen.dynamic',
      triggers: ['touch::body::tap'],
      priority: 1,
      cooldownMs: 0,
      interrupt: 'all',
      beats: [{ at: 0, cue: { kind: 'pose', preset: 'squash' } }],
    };
    const { result } = renderHook(() =>
      useScriptDirector({
        enabled: true,
        getController: () => controller,
        showSubtitle: () => undefined,
        extraScenes: [generated],
      }),
    );

    let played = false;
    act(() => {
      played = result.current.playEvent({ kind: 'touch', region: 'body', gesture: 'tap' }, cueCtx());
    });
    expect(played).toBe(true);
    expect(calls).toContain('squash');
  });
});
