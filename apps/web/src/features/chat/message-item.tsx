'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/utils/clipboard';
import { MarkdownContent } from './markdown';
import { ToolTrace } from './tool-trace';

interface Props {
  message: Message;
  assistantName: string;
  /** 重新生成该助手回复（仅最后一条助手消息会传入） */
  onRetry?: () => void;
  /** 用户消息编辑后作为新一轮重新发送 */
  onResend?: (content: string) => void;
  /** 流式进行中，禁用操作按钮 */
  disabled?: boolean;
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

function UserBody({ message, onResend, disabled }: Pick<Props, 'message' | 'onResend' | 'disabled'>) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);

  if (editing) {
    const submit = () => {
      const text = draft.trim();
      if (!text) return;
      setEditing(false);
      onResend?.(text);
    };
    return (
      <div className="space-y-2" data-testid="user-edit">
        <textarea
          className="w-full resize-y rounded-md border bg-background p-2 text-sm"
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>
            重新发送
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(message.content);
              setEditing(false);
            }}
          >
            取消
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/msg">
      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
      {onResend && !disabled && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover/msg:opacity-100"
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
        >
          编辑并重发
        </button>
      )}
    </div>
  );
}

export function MessageItem({ message, assistantName, onRetry, onResend, disabled }: Props) {
  const isUser = message.role === 'user';
  const canRegenerate =
    !isUser &&
    !disabled &&
    Boolean(onRetry) &&
    (message.status === 'error' || message.status === 'completed');
  const showCopy = !isUser && message.status === 'completed' && Boolean(message.content);

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
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? '我' : assistantName}
          </span>
          {message.status === 'stopped' && <Badge variant="warning">已停止</Badge>}
        </div>

        {!isUser && message.toolTrace.length > 0 && <ToolTrace trace={message.toolTrace} />}

        {isUser ? (
          <UserBody message={message} onResend={onResend} disabled={disabled} />
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
          </div>
        )}

        {(showCopy || canRegenerate) && (
          <div className="flex gap-3 pt-1">
            {showCopy && <CopyButton content={message.content} />}
            {canRegenerate && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onRetry?.()}
                data-testid="regenerate-button"
              >
                重新生成
              </button>
            )}
          </div>
        )}
        <Citations message={message} />
      </div>
    </div>
  );
}
