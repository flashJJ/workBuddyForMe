'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared';
import { Badge } from '@/components/ui/badge';
import { copyText } from '@/lib/utils/clipboard';
import { MarkdownContent } from './markdown';

interface Props {
  message: Message;
  assistantName: string;
  onRetry?: (content: string) => void;
  /** 重试时取上一条用户消息，由列表层传入 */
  previousUserContent?: string;
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await copyText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground hover:text-foreground"
      onClick={() => void copy()}
    >
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function Citations({ message }: { message: Message }) {
  if (message.citations.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t pt-2" data-testid="citations">
      <p className="text-xs font-medium text-muted-foreground">引用来源</p>
      <ol className="space-y-1">
        {message.citations.map((citation) => (
          <li key={`${citation.documentId}-${citation.ordinal}`} className="text-xs">
            <Badge variant="outline" className="mr-1">
              [{citation.ordinal}]
            </Badge>
            <span className="font-medium">{citation.documentName}</span>
            {citation.snippet && (
              <span className="ml-1 text-muted-foreground">— {citation.snippet}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MessageItem({ message, assistantName, onRetry, previousUserContent }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      className="flex gap-3 px-4 py-4"
      data-testid={`message-${message.id || 'pending'}`}
      data-role={message.role}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm ${
          isUser ? 'bg-primary/10 text-primary' : 'bg-muted'
        }`}
        aria-hidden
      >
        {isUser ? '我' : 'AI'}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? '我' : assistantName}
          </span>
          {message.status === 'stopped' && <Badge variant="warning">已停止</Badge>}
        </div>

        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {message.status === 'streaming' && (
          <span className="inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
        )}

        {message.status === 'error' && (
          <div
            className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-600"
            data-testid="message-error"
          >
            <p>生成失败：{message.errorMessage ?? message.errorCode ?? '未知错误'}</p>
            {onRetry && previousUserContent && (
              <button
                type="button"
                className="mt-1 underline"
                onClick={() => onRetry(previousUserContent)}
              >
                重新生成
              </button>
            )}
          </div>
        )}

        {!isUser && message.status !== 'streaming' && message.content && (
          <div className="pt-1">
            <CopyButton content={message.content} />
          </div>
        )}
        <Citations message={message} />
      </div>
    </div>
  );
}
