'use client';

import * as React from 'react';
import { Sparkles, X } from 'lucide-react';
import { stripExpressionDirectives } from '@wbfm/shared';
import type { ProactiveBubble } from './use-proactive-chat';

interface Props {
  bubble: ProactiveBubble;
  assistantName: string;
  onDismiss: () => void;
}

/**
 * F8 主动搭话气泡：渲染在消息列表底部、Composer 上方的独立临时条，
 * 不进入消息列表/不持久化；表情标签仅用于驱动 Live2D，气泡内剥离展示。
 */
export function ProactiveBubbleBar({ bubble, assistantName, onDismiss }: Props) {
  const text = stripExpressionDirectives(bubble.content).trim();
  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-start gap-2 px-4 pb-1"
      data-testid="proactive-bubble"
      data-status={bubble.status}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg rounded-tl-sm border bg-muted/40 px-3 py-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[11px] leading-tight text-muted-foreground">
            {assistantName} 主动搭话
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {text}
            {bubble.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-current align-middle" />
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="收起主动搭话"
        data-testid="proactive-bubble-close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
