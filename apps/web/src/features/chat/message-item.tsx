'use client';

import * as React from 'react';
import { stripExpressionDirectives } from '@wbfm/shared/schemas';
import { type Message } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/utils/clipboard';
import { AttachmentImage } from './attachment-image';
import { MarkdownContent } from './markdown';
import { ToolTrace } from './tool-trace';
import { MessageFeedbackButtons } from './message-feedback';

interface Props {
  message: Message;
  assistantName: string;
  /** 重新生成该助手回复（仅最后一条助手消息会传入） */
  onRetry?: () => void;
  /** 用户消息编辑后作为新一轮重新发送 */
  onResend?: (content: string) => void;
  /** v0.5 P1-2：反馈落库成功后同步本地视图 */
  onFeedback?: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
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
            {citation.sourceUrl ? (
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={citation.sourceUrl}
                className="font-medium text-primary hover:underline"
                data-testid="citation-source-link"
              >
                {citation.documentName}
              </a>
            ) : (
              <span className="font-medium">{citation.documentName}</span>
            )}
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

  const imageIds = message.contentParts
    .filter((part): part is Extract<typeof part, { type: 'image' }> => part.type === 'image')
    .map((part) => part.attachmentId);

  return (
    <div className="group/msg">
      {message.content && <p className="whitespace-pre-wrap text-sm">{message.content}</p>}
      {imageIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="message-images">
          {imageIds.map((id) => (
            <AttachmentImage key={id} attachmentId={id} />
          ))}
        </div>
      )}
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

export function MessageItem({ message, assistantName, onRetry, onResend, onFeedback, disabled }: Props) {
  const isUser = message.role === 'user';
  const canRegenerate =
    !isUser &&
    !disabled &&
    Boolean(onRetry) &&
    (message.status === 'error' || message.status === 'completed');
  const showCopy = !isUser && message.status === 'completed' && Boolean(message.content);
  const canFeedback = !isUser && message.status === 'completed' && Boolean(message.id && onFeedback);
  // v1.0 M3：助手消息上屏/复制时剥离表情指令标签（标签驱动形象，不属于回复文本）
  const displayContent = isUser ? message.content : stripExpressionDirectives(message.content);

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
          <MarkdownContent content={displayContent} />
        )}

        {message.status === 'streaming' && (
          <span className="inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
        )}

        {message.status === 'error' && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
            data-testid="message-error"
          >
            <p>生成失败：{message.errorMessage ?? message.errorCode ?? '未知错误'}</p>
          </div>
        )}

        {(showCopy || canRegenerate || canFeedback) && (
          <div className="flex items-center gap-3 pt-1">
            {showCopy && <CopyButton content={displayContent} />}
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
            {canFeedback && onFeedback && (
              <MessageFeedbackButtons
                message={message}
                disabled={disabled}
                onApplied={onFeedback}
              />
            )}
          </div>
        )}
        <Citations message={message} />
      </div>
    </div>
  );
}
