'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import { EmptyState } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { AgentCardEntry } from '../agent-collab';
import type { StreamTiming } from './chat-session.types';
import { MessageItem } from './message-item';

interface Props {
  messages: Message[];
  assistantName: string;
  streaming: boolean;
  /** v1.4 任务模式：助手消息 id → 协作泳道卡 */
  agentCards?: Record<string, AgentCardEntry>;
  /** 重新生成最后一条助手回复 */
  onRetry: () => void;
  /** 用户消息编辑后重新发送 */
  onResend: (content: string) => void;
  /** v0.5 P1-2：消息反馈同步本地视图 */
  onFeedback?: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
  /** v2.4 M5：当前轮首字/落定计时（仅末条助手消息展示） */
  streamTiming?: StreamTiming | null;
  /** v2.6 M4：从记忆来源深链跳入时定位并高亮的消息 id */
  highlightMessageId?: string | null;
  /** 深链消息已不存在时的可读降级回调 */
  onHighlightMissing?: () => void;
}

export function MessageList({
  messages,
  assistantName,
  streaming,
  agentCards,
  onRetry,
  onResend,
  onFeedback,
  streamTiming,
  highlightMessageId,
  onHighlightMissing,
}: Props) {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const warnedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const target = highlightMessageId
      ? containerRef.current?.querySelector(`[data-message-id="${highlightMessageId}"]`)
      : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (
      highlightMessageId &&
      messages.length > 0 &&
      warnedRef.current !== highlightMessageId &&
      !messages.some((message) => message.id === highlightMessageId)
    ) {
      warnedRef.current = highlightMessageId;
      onHighlightMissing?.();
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, highlightMessageId, onHighlightMissing]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title={t('chatMessages.list.emptyTitle')}
          description={
            streaming
              ? t('chatMessages.list.generatingReply')
              : t('chatMessages.list.emptyDescription')
          }
        />
      </div>
    );
  }

  // 仅最后一条助手消息允许重新生成，避免对历史轮次误操作
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto" data-testid="message-list">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id || `pending-${index}`}
          message={message}
          highlighted={Boolean(highlightMessageId && message.id === highlightMessageId)}
          assistantName={assistantName}
          disabled={streaming}
          agentCard={agentCards?.[message.id]}
          onRetry={index === lastAssistantIndex && !streaming ? onRetry : undefined}
          onResend={message.role === 'user' && !streaming ? onResend : undefined}
          onFeedback={onFeedback}
          streamTiming={index === lastAssistantIndex ? streamTiming : undefined}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
