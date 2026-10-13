'use client';

import type * as React from 'react';
import type { ExpressionTag } from '@wbfm/shared/schemas';
import type { EventStage } from '@/features/events/use-event-stage';
import { AvatarHost } from './avatar-host';
import type { Live2dController } from './live2d-controller';

interface Props {
  modelId: string;
  /** 当前生效表情（chat 页统一计算） */
  expression: ExpressionTag;
  /** v1.7 事件舞台（控制器 ref + 演出视图 + 跳过/预览/连摸回调） */
  eventStage: EventStage;
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  speaking: boolean;
}

/**
 * 对话页右侧形象栏（M3）。
 * 大屏（lg+）才显示；内部 Live2dCanvas 自带动态 import，关闭形象时本组件根本不挂载，
 * Cubism/PIXI chunk 零加载。事件舞台（播放器/导演）在 chat 页存活，
 * 因此桌宠打开导致本栏卸载时，台词 TTS 与桌宠中继仍可继续。
 */
export function ChatAvatarRail({ modelId, expression, eventStage, getLevel, speaking }: Props) {
  return (
    <aside
      className="hidden w-64 shrink-0 border-l bg-background lg:block xl:w-72"
      data-testid="avatar-rail"
    >
      <AvatarHost
        modelId={modelId}
        expression={expression}
        controllerRef={eventStage.controllerRef as React.MutableRefObject<Live2dController | null>}
        getLevel={getLevel}
        speaking={speaking}
        eventPlaying={eventStage.playing}
        eventSubtitle={eventStage.subtitle}
        eventFx={eventStage.fx}
        onEventSkip={eventStage.skip}
        onPreview={eventStage.previewBuiltIn}
        onHeadTouchStreak={eventStage.onHeadTouchStreak}
      />
    </aside>
  );
}
