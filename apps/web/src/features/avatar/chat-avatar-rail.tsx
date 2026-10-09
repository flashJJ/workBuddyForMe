'use client';

import type { Message } from '@wbfm/shared/types';
import { AvatarHost } from './avatar-host';

interface Props {
  modelId: string;
  messages: Message[];
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  speaking: boolean;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
}

/**
 * 对话页右侧形象栏（M3）。
 * 大屏（lg+）才显示；内部 Live2dCanvas 自带动态 import，关闭形象时本组件根本不挂载，
 * Cubism/PIXI chunk 零加载。
 */
export function ChatAvatarRail({ modelId, messages, getLevel, speaking, proactiveContent = null }: Props) {
  return (
    <aside
      className="hidden w-64 shrink-0 border-l bg-background lg:block xl:w-72"
      data-testid="avatar-rail"
    >
      <AvatarHost
        modelId={modelId}
        messages={messages}
        getLevel={getLevel}
        speaking={speaking}
        proactiveContent={proactiveContent}
      />
    </aside>
  );
}
