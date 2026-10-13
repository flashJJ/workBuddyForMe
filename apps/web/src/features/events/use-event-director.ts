'use client';

import * as React from 'react';
import type { EventDefinition } from '@wbfm/shared/schemas';
import {
  createWallClock,
  DEFAULT_QUIET,
  EventDirector,
  EventRunner,
  InMemoryEventUsageStore,
  defaultDateKey,
  type ConditionContext,
  type EventEffectSink,
} from '@wbfm/core';
import type { EventPlayer } from './event-player';

export interface EventDirectorSettings {
  masterEnabled: boolean;
  tier: 'low' | 'standard' | 'high';
}

export type PreviewResult = 'ok' | 'busy' | 'conv';

interface UseEventDirectorArgs {
  /** M2 播放器（effect 序保证先于本 hook 的 effect 创建；委托 sink 再做一层 null 兜底） */
  playerRef: React.MutableRefObject<EventPlayer | null>;
  isConvLocked: () => boolean;
  isTtsLocked: () => boolean;
  hasOutlet: () => boolean;
  getSettings: () => EventDirectorSettings;
}

/**
 * 转发 sink：director 生命周期内播放器实例稳定存在，
 * 但构造顺序/卸载边界统一经 playerRef 转发，避免持有过期实例。
 */
function delegatingSink(
  playerRef: React.MutableRefObject<EventPlayer | null>,
): EventEffectSink {
  return {
    expression: (tag, ms) => playerRef.current?.expression(tag, ms),
    motion: (group) => playerRef.current?.motion(group),
    gaze: (x, y) => playerRef.current?.gaze(x, y),
    fx: (id) => playerRef.current?.fx(id),
    spatial: (action) => playerRef.current?.spatial(action),
    speech: (key, speak, signal) =>
      playerRef.current?.speech(key, speak, signal) ?? Promise.resolve(),
    release: () => playerRef.current?.release(),
  };
}

/**
 * v1.7 EventDirector 接线（M3）：墙钟 + 内存 usage（M4 换 event_usage 仓储）。
 * - 三锁谓词全部从 v1.6 运行时状态派生（ref 读取，不重建 director）；
 * - CONV 上升沿通知导演打断当前、清空队列，同时打断手动预览；
 * - 触发器准入走 admit（全闸门）；preview 绕过冷却/勿扰/停用，但 CONV 锁硬拦截。
 */
export function useEventDirector(args: UseEventDirectorArgs) {
  const argsRef = React.useRef(args);
  argsRef.current = args;

  const directorRef = React.useRef<EventDirector | null>(null);
  const previewRunnerRef = React.useRef<EventRunner | null>(null);
  const sinkRef = React.useRef<EventEffectSink | null>(null);
  if (!sinkRef.current) sinkRef.current = delegatingSink(args.playerRef);

  React.useEffect(() => {
    const clock = createWallClock();
    const usage = new InMemoryEventUsageStore();
    const gates = {
      isConvLocked: () => argsRef.current.isConvLocked(),
      isTtsLocked: () => argsRef.current.isTtsLocked(),
      hasOutlet: () => argsRef.current.hasOutlet(),
    };
    const director = new EventDirector({
      gates,
      clock,
      sink: sinkRef.current!,
      usage,
      toDateKey: (ms) => defaultDateKey(ms),
      settings: {
        masterEnabled: argsRef.current.getSettings().masterEnabled,
        quietStart: DEFAULT_QUIET.start,
        quietEnd: DEFAULT_QUIET.end,
        tier: argsRef.current.getSettings().tier,
      },
      runnerFactory: (def, ctx) => {
        const runner = new EventRunner(def, ctx, { sink: sinkRef.current!, gates, clock });
        return runner;
      },
    });
    directorRef.current = director;
    return () => {
      director.notifyConvStart();
      directorRef.current = null;
      previewRunnerRef.current?.interrupt('higher_priority');
      previewRunnerRef.current = null;
    };
    // 仅挂载期创建；锁/设置变化经 ref 读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 设置热同步（不重建导演/不丢队列）
  React.useEffect(() => {
    const s = argsRef.current.getSettings();
    directorRef.current?.setSettings({
      masterEnabled: s.masterEnabled,
      tier: s.tier,
    });
  });

  // CONV 上升沿：最高优先级抢占
  const prevConvRef = React.useRef(false);
  React.useEffect(() => {
    const locked = args.isConvLocked();
    if (locked && !prevConvRef.current) {
      directorRef.current?.notifyConvStart();
      previewRunnerRef.current?.interrupt('conv_start');
    }
    prevConvRef.current = locked;
  });

  const admit = React.useCallback((def: EventDefinition, ctx: ConditionContext) => {
    const director = directorRef.current;
    if (!director) return { kind: 'suppressed' as const, reason: 'master_off' as const };
    return director.trigger(def, ctx);
  }, []);

  const skip = React.useCallback(() => {
    directorRef.current?.skipCurrent();
    previewRunnerRef.current?.skip();
  }, []);

  const isBusy = React.useCallback(
    () => directorRef.current?.isBusy() === true || previewRunnerRef.current !== null,
    [],
  );

  /** 手动试运行：绕过冷却/勿扰/停用；CONV 锁或已有演出时拒绝 */
  const preview = React.useCallback(
    (def: EventDefinition, ctx: ConditionContext): PreviewResult => {
      if (argsRef.current.isConvLocked()) return 'conv';
      const director = directorRef.current;
      if (!director || director.isBusy() || previewRunnerRef.current) return 'busy';
      const clock = createWallClock();
      const gates = {
        isConvLocked: () => argsRef.current.isConvLocked(),
        isTtsLocked: () => argsRef.current.isTtsLocked(),
        hasOutlet: () => argsRef.current.hasOutlet(),
      };
      const runner = new EventRunner(def, ctx, { sink: sinkRef.current!, gates, clock });
      previewRunnerRef.current = runner;
      void runner.done().then(() => {
        if (previewRunnerRef.current === runner) previewRunnerRef.current = null;
      });
      return 'ok';
    },
    [],
  );

  return { admit, skip, preview, isBusy };
}
