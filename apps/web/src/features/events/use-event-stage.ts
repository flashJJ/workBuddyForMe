'use client';

import * as React from 'react';
import type {
  EmotionState,
  EventFrequencyTier,
  ExpressionTag,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { getBuiltInEvent } from '@wbfm/shared/events';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { EventPlayerControllerLike, EventPlayerView } from './event-player';
import { useEventPlayer, type EventPlaybackBridge } from './use-event-player';
import { buildConditionContext } from './condition-context';
import { readLastInteractionMinutes } from './event-activity';
import { useEventDirector, type PreviewResult } from './use-event-director';

export interface UseEventStageArgs {
  /** 当前助手（用量闸门/事件隔离按此 id；切换即重建导演） */
  assistantId: string;
  /** 情绪状态快照（chat 页统一拉取，供条件上下文；不触发渲染） */
  emotionState: EmotionState | null;
  /** release 时交还的情绪基线表情 */
  baselineExpression: ExpressionTag;
  playback: EventPlaybackBridge | null;
  ttsEnabled: boolean;
  ttsReady: boolean;
  convLocked: boolean;
  ttsLocked: boolean;
  hasOutlet: boolean;
  eventsEnabled: boolean;
  frequencyTier: EventFrequencyTier;
  disabledEventIds: readonly string[];
}

export interface EventStage {
  controllerRef: React.MutableRefObject<EventPlayerControllerLike | null>;
  playing: boolean;
  subtitle: string | null;
  fx: EventPlayerView['fx'];
  triggerEvent: (eventId: string, extraCounters?: Record<string, number>) => boolean;
  previewBuiltIn: (eventId: string) => PreviewResult | 'missing';
  skip: () => void;
  onHeadTouchStreak: () => void;
  /**
   * v1.7 角色化提醒投递（动态原文，非剧本 lineKey）。
   * 仅在有演出出口且无对话/无事件占用时演出；否则返回 false 由调用方走通知兜底。
   */
  deliverReminder: (text: string) => Promise<boolean>;
}

/**
 * v1.7 事件舞台编排（M3）：M2 播放器 + M1 导演 + 触发上下文一站接线。
 * 触发器（消息/归来/总线）在 useEventTriggers，经 triggerEvent 入导演；
 * 手动试运行/跳过/连摸回调在此暴露给 UI。
 */
export function useEventStage(args: UseEventStageArgs): EventStage {
  const { t } = useI18n();
  const controllerRef = React.useRef<EventPlayerControllerLike | null>(null);
  // 导演/播放器的 effect 在挂载期一次性创建，全部易变入参经 argsRef 读取
  const argsRef = React.useRef(args);
  argsRef.current = args;

  const resolveLine = React.useCallback((key: string) => t(key as MessageKey), [t]);
  const { playerRef, view } = useEventPlayer({
    controllerRef,
    baselineExpression: args.baselineExpression,
    resolveLine,
    playback: args.playback,
    ttsEnabled: args.ttsEnabled,
    ttsReady: args.ttsReady,
  });

  const { admit, skip, preview, isBusy } = useEventDirector({
    assistantId: args.assistantId,
    playerRef,
    isConvLocked: () => argsRef.current.convLocked,
    isTtsLocked: () => argsRef.current.ttsLocked,
    hasOutlet: () => argsRef.current.hasOutlet,
    getSettings: () => ({
      masterEnabled: argsRef.current.eventsEnabled,
      tier: argsRef.current.frequencyTier,
    }),
  });

  const triggerEvent = React.useCallback(
    (eventId: string, extraCounters: Record<string, number> = {}): boolean => {
      const def = getBuiltInEvent(eventId);
      if (!def) return false;
      if (argsRef.current.disabledEventIds.includes(eventId)) return false;
      const now = Date.now();
      const ctx = buildConditionContext({
        emotion: argsRef.current.emotionState,
        now,
        lastInteractionMin: readLastInteractionMinutes(now),
        extraCounters,
      });
      const decision = admit(def, ctx);
      return decision.kind === 'admitted' || decision.kind === 'queued';
    },
    [admit],
  );

  const previewBuiltIn = React.useCallback(
    (eventId: string): PreviewResult | 'missing' => {
      const def = getBuiltInEvent(eventId);
      if (!def) return 'missing';
      // 停用剧本仍允许手动预览（用户显式操作；绕过冷却/勿扰/停用，仅受 CONV 锁约束）
      const now = Date.now();
      const ctx = buildConditionContext({
        emotion: argsRef.current.emotionState,
        now,
        lastInteractionMin: readLastInteractionMinutes(now),
      });
      return preview(def, ctx);
    },
    [preview],
  );

  const onHeadTouchStreak = React.useCallback(() => {
    triggerEvent('ev.touch.shy', { touchStreak: 3 });
  }, [triggerEvent]);

  // 提醒演出中止器：对话锁上升沿/卸载立即中止（CONV 最高优先级，不与对话抢 TTS）
  const reminderAbortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    if (args.convLocked) reminderAbortRef.current?.abort();
  }, [args.convLocked]);
  React.useEffect(
    () => () => {
      reminderAbortRef.current?.abort();
    },
    [],
  );

  const deliverReminder = React.useCallback(
    async (text: string): Promise<boolean> => {
      const current = argsRef.current;
      if (!current.hasOutlet || current.convLocked || current.ttsLocked) return false;
      if (isBusy()) return false;
      const player = playerRef.current;
      if (!player) return false;
      const controller = new AbortController();
      reminderAbortRef.current = controller;
      try {
        player.expression('joy');
        await player.speakText(
          text,
          current.ttsEnabled && current.ttsReady,
          controller.signal,
        );
        return !controller.signal.aborted;
      } catch {
        return false;
      } finally {
        if (reminderAbortRef.current === controller) reminderAbortRef.current = null;
        player.release();
      }
    },
    [isBusy, playerRef],
  );

  // Esc 跳过（仅演出中监听；演出是模态性打断，输入框聚焦时也允许）
  React.useEffect(() => {
    if (!view.playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.playing, skip]);

  return {
    controllerRef,
    playing: view.playing,
    subtitle: view.subtitle,
    fx: view.fx,
    triggerEvent,
    previewBuiltIn,
    skip,
    onHeadTouchStreak,
    deliverReminder,
  };
}
