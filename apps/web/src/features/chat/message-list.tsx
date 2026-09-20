'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared';
import { EmptyState } from '@/components/common/state';
import { MessageItem } from './message-item';

interface Props {
  messages: Message[];
  assistantName: string;
  streaming: boolean;
  onRetry: (content: string) => void;
}

export function MessageList({ messages, assistantName, streaming, onRetry }: Props) {
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

  const lastUserContent = [...messages].reverse().find((m) => m.role === 'user')?.content;

  return (
    <div className="flex-1 overflow-y-auto" data-testid="message-list">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id || `pending-${index}`}
          message={message}
          assistantName={assistantName}
          previousUserContent={lastUserContent}
          onRetry={message.role === 'assistant' && message.status === 'error' ? onRetry : undefined}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
