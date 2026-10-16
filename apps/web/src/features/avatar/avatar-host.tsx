'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AvatarCanvasRouter } from './avatar-canvas-router';
import type { Live2dController } from './live2d-controller';
import { DEFAULT_EXPRESSION } from './expression-parser';
import type { ExpressionTag } from './expression-parser';
import { useHeadTouch, type TouchControllerLike } from './use-head-touch';
import { type ActiveFx } from '@/features/events/fx-registry';
import { EventFxLayer } from '@/features/events/event-fx-layer';
import { EventSubtitleSlot } from '@/features/events/event-subtitle-bubble';
import { EventSkipOverlay } from '@/features/events/event-skip-overlay';
import { EventPreviewMenu } from '@/features/events/event-preview-menu';
import type { PreviewResult } from '@/features/events/use-event-director';

interface AvatarHostProps {
  /** 当前生效表情（内联标签优先，回落情绪基线；由 chat 页统一计算） */
  expression: ExpressionTag;
  /** Live2dController 回传 ref（舞台/摸头/事件共用同一实例） */
  controllerRef: React.MutableRefObject<Live2dController | null>;
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  /** 是否正在朗读 */
  speaking: boolean;
  /** 模型 id（语音设置 avatarModelId） */
  modelId: string;
  // v1.7 事件演出视图
  eventPlaying: boolean;
  eventSubtitle: string | null;
  eventFx: ActiveFx[];
  onEventSkip: () => void;
  onPreview: (eventId: string) => PreviewResult | 'missing';
  /** 2s 内第 3 次摸头（进入保护态）时触发 ev.touch.shy */
  onHeadTouchStreak: () => void;
}

/**
 * 对话页形象区：Live2D 画布 + 状态角标 + v1.7 事件演出层。
 * 情绪基线/事件舞台在 chat 页统一编排，本组件只负责呈现与本地手势。
 */
export function AvatarHost({
  expression,
  controllerRef,
  getLevel,
  speaking,
  modelId,
  eventPlaying,
  eventSubtitle,
  eventFx,
  onEventSkip,
  onPreview,
  onHeadTouchStreak,
}: AvatarHostProps) {
  const { t } = useI18n();
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
  );

  const handleHeadTouch = () => {
    const result = onHeadTouch();
    if (result.accepted && result.enteredProtection) onHeadTouchStreak();
  };

  return (
    <div className="flex h-full flex-col" data-testid="avatar-host">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t('avatar.rail.title')}</span>
        <div className="flex items-center gap-1">
          <EventPreviewMenu busy={eventPlaying || speaking} onPreview={onPreview} />
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
      </div>
      <div className="relative min-h-0 flex-1">
        <AvatarCanvasRouter
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={speaking}
          controllerRef={controllerRef}
          onHeadTouch={handleHeadTouch}
        />
        <EventFxLayer fx={eventFx} />
        <EventSubtitleSlot text={eventSubtitle} />
        {eventPlaying && <EventSkipOverlay onSkip={onEventSkip} />}
      </div>
    </div>
  );
}
