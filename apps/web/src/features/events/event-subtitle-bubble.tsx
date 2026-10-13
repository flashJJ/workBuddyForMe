'use client';

import * as React from 'react';

/**
 * v1.7 事件台词气泡：形象舞台底部居中的短句条。
 * - role=status：演出字幕是状态性追加内容，屏幕阅读器自然播报且不打断焦点；
 * - pointer-events-none：不拦截舞台点击（跳过演出走全局 Esc/点击层，M3 接入）；
 * - 文案限宽两行，避免长台词撑破形象栏。
 */
export interface EventSubtitleBubbleProps {
  text: string;
}

export function EventSubtitleBubble({ text }: EventSubtitleBubbleProps) {
  if (!text) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center"
      data-testid="event-subtitle-bubble"
      role="status"
    >
      <div className="max-w-full rounded-lg border bg-background/85 px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-sm backdrop-blur-sm">
        <span className="line-clamp-2 break-words">{text}</span>
      </div>
    </div>
  );
}

/** 空节点占位（条件渲染处可直接用） */
export function EventSubtitleSlot({ text }: { text: string | null }): React.ReactElement | null {
  return text ? <EventSubtitleBubble text={text} /> : null;
}
