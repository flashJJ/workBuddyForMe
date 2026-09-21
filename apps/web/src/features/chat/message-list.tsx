'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared';
import { EmptyState } from '@/components/common/state';
import { MessageItem } from './message-item';

interface Props {
  messages: Message[];
  assistantName: string;
  streaming: boolean;
  /** 重新生成最后一条助手回复 */
  onRetry: () => void;
  /** 用户消息编辑后重新发送 */
  onResend: (content: string) => void;
}

export function MessageList({ messages, assistantName, streaming, onRetry, onResend }: Props) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title="开始新对话"
          description={streaming ? '正在生成回复…' : '发送第一条消息，助手会在这里回应你。'}
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
    <div className="flex-1 overflow-y-auto" data-testid="message-list">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id || `pending-${index}`}
          message={message}
          assistantName={assistantName}
          disabled={streaming}
          onRetry={index === lastAssistantIndex && !streaming ? onRetry : undefined}
          onResend={message.role === 'user' && !streaming ? onResend : undefined}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
