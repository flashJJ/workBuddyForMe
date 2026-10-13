'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Live2dCanvas } from './live2d-canvas';
import type { Live2dController } from './live2d-controller';
import { DEFAULT_EXPRESSION } from './expression-parser';
import { useHeadTouch, type TouchControllerLike } from './use-head-touch';
import { useEmotionExpression } from './use-emotion-expression';
import { EventFxLayer } from '@/features/events/event-fx-layer';
import { EventSubtitleSlot } from '@/features/events/event-subtitle-bubble';
import {
  useEventPlayer,
  type EventPlaybackBridge,
} from '@/features/events/use-event-player';
import type { EventPlayerControllerLike } from '@/features/events/event-player';

interface AvatarHostProps {
  /** 当前会话消息（含流式 live 消息），用于从回复标签推导表情 */
  messages: Message[];
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  /** 是否正在朗读 */
  speaking: boolean;
  /** 模型 id（语音设置 avatarModelId） */
  modelId: string;
  /** 当前助手 id（v1.6：情绪基线拉取） */
  assistantId: string;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
  /** v1.7：事件台词复用的播放队列（口型/单 AudioContext 同通道） */
  eventPlayback?: EventPlaybackBridge | null;
  /** v1.7：事件台词是否允许出声（全局朗读开关 + TTS 模型就绪） */
  eventTtsEnabled?: boolean;
  eventTtsReady?: boolean;
}

/**
 * 对话页形象区：Live2D 画布 + 状态角标。
 * v1.6：表情经 useEmotionExpression 融合（内联标签优先，无标签回落情绪基线），
 * 头部摸头给害羞/抗议反馈（rail 不出短句，短句在桌宠气泡呈现）。
 */
export function AvatarHost({
  messages,
  getLevel,
  speaking,
  modelId,
  assistantId,
  proactiveContent = null,
  eventPlayback = null,
  eventTtsEnabled = false,
  eventTtsReady = false,
}: AvatarHostProps) {
  const { t } = useI18n();
  const expression = useEmotionExpression(assistantId, messages, proactiveContent);
  // 舞台内 Live2dController 由动态 chunk 创建；ref 结构面转型与触摸 hook 同口径
  const controllerRef = React.useRef<Live2dController | null>(null);
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
  );

  // v1.7：事件演出播放器（M2 仅挂载；M3 触发器/director 接入后开始驱动）
  // event.* 键 M3 随内置剧本入词典，此前缺键由 i18n 回退键名
  const resolveEventLine = React.useCallback(
    (key: string) => t(key as MessageKey),
    [t],
  );
  const { view: eventView } = useEventPlayer({
    controllerRef: controllerRef as React.MutableRefObject<EventPlayerControllerLike | null>,
    baselineExpression: expression,
    resolveLine: resolveEventLine,
    playback: eventPlayback,
    ttsEnabled: eventTtsEnabled,
    ttsReady: eventTtsReady,
  });

  return (
    <div className="flex h-full flex-col" data-testid="avatar-host">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t('avatar.rail.title')}</span>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          data-testid="avatar-state"
          data-state={speaking ? 'speaking' : 'idle'}
        >
          {speaking
            ? t('avatar.state.speaking')
            : expression === DEFAULT_EXPRESSION
              ? t('avatar.state.idle')
              : expression}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <Live2dCanvas
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={speaking}
          controllerRef={controllerRef}
          onHeadTouch={() => onHeadTouch()}
        />
        <EventFxLayer fx={eventView.fx} />
        <EventSubtitleSlot text={eventView.subtitle} />
      </div>
    </div>
  );
}
