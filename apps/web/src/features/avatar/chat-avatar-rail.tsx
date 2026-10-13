'use client';

import type { Message } from '@wbfm/shared/types';
import type { EventPlaybackBridge } from '@/features/events/use-event-player';
import { AvatarHost } from './avatar-host';

interface Props {
  modelId: string;
  messages: Message[];
  /** 当前助手 id（v1.6 情绪基线） */
  assistantId: string;
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  speaking: boolean;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
  /** v1.7：事件台词播放桥 + 出声门控（M3 触发器接入前播放器保持休眠） */
  eventPlayback?: EventPlaybackBridge | null;
  eventTtsEnabled?: boolean;
  eventTtsReady?: boolean;
}

/**
 * 对话页右侧形象栏（M3）。
 * 大屏（lg+）才显示；内部 Live2dCanvas 自带动态 import，关闭形象时本组件根本不挂载，
 * Cubism/PIXI chunk 零加载。
 */
export function ChatAvatarRail({
  modelId,
  assistantId,
  messages,
  getLevel,
  speaking,
  proactiveContent = null,
  eventPlayback = null,
  eventTtsEnabled = false,
  eventTtsReady = false,
}: Props) {
  return (
    <aside
      className="hidden w-64 shrink-0 border-l bg-background lg:block xl:w-72"
      data-testid="avatar-rail"
    >
      <AvatarHost
        modelId={modelId}
        assistantId={assistantId}
        messages={messages}
        getLevel={getLevel}
        speaking={speaking}
        proactiveContent={proactiveContent}
        eventPlayback={eventPlayback}
        eventTtsEnabled={eventTtsEnabled}
        eventTtsReady={eventTtsReady}
      />
    </aside>
  );
}
