'use client';

import * as React from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ExpressionTag } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useCollapsiblePanel } from '@/lib/hooks/use-collapsible-panel';
import type { EventStage } from '@/features/events/hooks';
import { AvatarHost } from './avatar-host';
import type { Live2dController } from '../live2d/live2d-controller';

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

/** 形象栏收起状态（用户偏好，localStorage 记忆） */
const COLLAPSED_KEY = 'wbfm.chat.avatarRail.collapsed';

/**
 * 对话页右侧形象栏（M3）。
 * 大屏（lg+）才显示；内部 Live2dCanvas 自带动态 import，关闭形象时本组件根本不挂载，
 * Cubism/PIXI chunk 零加载。事件舞台（播放器/导演）在 chat 页存活，
 * 因此桌宠打开导致本栏卸载时，台词 TTS 与桌宠中继仍可继续。
 * v2.23：新增收起态——窄窗口下把 256~288px 的常驻宽度让给消息区。
 */
export function ChatAvatarRail({ modelId, expression, eventStage, getLevel, speaking }: Props) {
  const { t } = useI18n();
  // 惰性读取偏好：形象栏只在设置加载后才挂载（非 SSR 首屏），不会产生 hydration 不一致。
  // 从未手动操作过时，xl（1280px）以下默认收起
  const { collapsed, toggle } = useCollapsiblePanel(
    COLLAPSED_KEY,
    () => window.innerWidth < 1280,
  );

  if (collapsed) {
    return (
      <aside
        className="hidden w-9 shrink-0 flex-col items-center border-l bg-background py-2 lg:flex"
        data-testid="avatar-rail"
        data-collapsed="true"
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={t('chat.avatarRail.expand')}
          title={t('chat.avatarRail.expand')}
          data-testid="avatar-rail-toggle"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="relative hidden w-64 shrink-0 border-l bg-background lg:block xl:w-72"
      data-testid="avatar-rail"
      data-collapsed="false"
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={t('chat.avatarRail.collapse')}
        title={t('chat.avatarRail.collapse')}
        data-testid="avatar-rail-toggle"
        className="absolute right-2 top-2 z-10 rounded-md border bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>
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
