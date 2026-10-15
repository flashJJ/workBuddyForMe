'use client';

import type { AppSettings, Message } from '@wbfm/shared/types';
import type { ExpressionTag, VoiceSettings } from '@wbfm/shared/schemas';
import { useEmotionState } from '@/features/avatar/use-emotion-expression';
import type { EventPlaybackBridge } from '@/features/events/use-event-player';
import { useEventStage, type EventStage } from '@/features/events/use-event-stage';
import { useEventTriggers } from '@/features/events/use-event-triggers';
import { useSchedulerTick } from '@/features/reminders/use-scheduler-tick';

export interface UseChatEventsArgs {
  assistantId: string;
  messages: Message[];
  proactiveContent: string | null;
  settings: AppSettings | undefined;
  voiceSettings: VoiceSettings | null | undefined;
  hasChatModel: boolean;
  ttsEnabled: boolean;
  ttsReady: boolean;
  convLocked: boolean;
  /** TTS 播放队列正在出声 */
  ttsSpeaking: boolean;
  /** 复用 v1.6 唯一 AudioPlaybackQueue 的三个稳定回调 */
  playback: Pick<EventPlaybackBridge, 'enqueue' | 'cancel' | 'waitDrained'>;
}

export interface ChatEventState {
  /** 当前生效表情（内联标签→情绪基线），喂给形象栏 */
  expression: ExpressionTag;
  stage: EventStage;
}

/**
 * v1.7 chat 页事件编排：情绪基线/条件上下文一次 GET，事件舞台（播放器+导演）
 * 与触发器在 chat 页存活——桌宠打开导致形象栏卸载时，TTS 与桌宠中继仍由主窗承接。
 */
export function useChatEvents(args: UseChatEventsArgs): ChatEventState {
  const { state: emotionState, expression } = useEmotionState(
    args.assistantId,
    args.messages,
    args.proactiveContent,
  );
  const hasOutlet = Boolean(args.voiceSettings?.avatarEnabled || args.voiceSettings?.petEnabled);
  const eventsEnabled = args.settings?.eventsEnabled !== false;
  const relationshipEnabled = args.settings?.relationshipEnabled !== false;

  const stage = useEventStage({
    assistantId: args.assistantId,
    emotionState,
    baselineExpression: expression,
    playback: args.hasChatModel
      ? {
          enqueue: args.playback.enqueue,
          cancel: args.playback.cancel,
          waitDrained: args.playback.waitDrained,
        }
      : null,
    ttsEnabled: args.ttsEnabled,
    ttsReady: args.ttsReady,
    convLocked: args.convLocked,
    ttsLocked: args.ttsSpeaking,
    hasOutlet,
    eventsEnabled,
    frequencyTier: args.settings?.eventFrequencyTier ?? 'standard',
    disabledEventIds: args.settings?.disabledEventIds ?? [],
    relationshipEnabled,
  });

  useEventTriggers({
    messages: args.messages,
    enabled: args.hasChatModel && hasOutlet && eventsEnabled,
    reunionEnabled:
      args.settings?.emotionEnabled !== false &&
      args.settings?.interactionLinesEnabled !== false,
    assistantId: args.assistantId,
    intimacy: emotionState?.relation.intimacy ?? 0,
    emotionState,
    relationshipEnabled,
    triggerEvent: stage.triggerEvent,
  });

  // v1.7：角色化提醒 10s tick（独立于剧情事件总开关——用户显式订阅的提醒必达）
  useSchedulerTick({
    currentAssistantId: args.assistantId,
    hasOutlet: () => hasOutlet,
    isConvLocked: () => args.convLocked,
    deliverReminder: stage.deliverReminder,
  });

  return { expression, stage };
}
