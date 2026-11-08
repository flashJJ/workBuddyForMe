'use client';

import * as React from 'react';
import { stripExpressionDirectives, stripEmotionSignalBlock } from '@wbfm/shared/schemas';
import { type Message } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import { AgentRunCard, type AgentCardEntry } from '@/features/agent-collab';
import { MessageBranchDialog } from '@/features/branch';
import { AttachmentImage } from './attachment-image';
import { CitationsList } from './citations-list';
import { MarkdownContent } from './markdown';
import { MessageActions } from './message-actions';
import { FirstTokenMetric, StreamingProgress } from '../page/streaming-progress';
import type { StreamTiming } from '../types/chat-session.types';
import { ToolTrace } from '../overlay/tool-trace';
import { streamingPhase } from '../base/tool-trace-state';

interface Props {
  message: Message;
  /** v2.21：底部「从此分支」入口 */
  conversationId?: string | null;
  assistantName: string;
  /** v1.4 任务模式：协作泳道卡（存在时渲染于正文上方，结论仍走消息正文） */
  agentCard?: AgentCardEntry;
  /** 重新生成该助手回复（仅最后一条助手消息会传入） */
  onRetry?: () => void;
  /** 用户消息编辑后作为新一轮重新发送 */
  onResend?: (content: string) => void;
  /** v0.5 P1-2：反馈落库成功后同步本地视图 */
  onFeedback?: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
  /** 流式进行中，禁用操作按钮 */
  disabled?: boolean;
  /** v2.4 M5：当前轮首字/落定计时（仅最后一条助手消息携带） */
  streamTiming?: StreamTiming | null;
  /** v2.6 M4：记忆来源深链定位高亮 */
  highlighted?: boolean;
}

function UserBody({ message, onResend, disabled }: Pick<Props, 'message' | 'onResend' | 'disabled'>) {
  const { t } = useI18n();
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
      <div className="w-full space-y-2" data-testid="user-edit">
        <textarea
          className="w-full resize-y rounded-md border bg-background p-2 text-sm"
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={submit}>
            {t('chatMessages.resend')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(message.content);
              setEditing(false);
            }}
          >
            {t('common.actions.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  const imageIds = message.contentParts
    .filter((part): part is Extract<typeof part, { type: 'image' }> => part.type === 'image')
    .map((part) => part.attachmentId);

  return (
    <div className="group/user flex max-w-[80%] flex-col items-end gap-1">
      {message.content && (
        <div className="rounded-2xl rounded-tr-md bg-muted px-3.5 py-2 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      )}
      {imageIds.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2" data-testid="message-images">
          {imageIds.map((id) => (
            <AttachmentImage key={id} attachmentId={id} />
          ))}
        </div>
      )}
      {onResend && !disabled && (
        <button
          type="button"
          className="text-xs text-muted-foreground opacity-0 transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
        >
          {t('chatMessages.editAndResend')}
        </button>
      )}
    </div>
  );
}

export function MessageItem({
  message,
  conversationId,
  assistantName,
  agentCard,
  onRetry,
  onResend,
  onFeedback,
  disabled,
  streamTiming,
  highlighted,
}: Props) {
  const { t } = useI18n();
  const sys = useSystemText();
  const isUser = message.role === 'user';
  const [branchOpen, setBranchOpen] = React.useState(false);
  const canBranch = Boolean(conversationId && message.content.trim());
  const openBranch = (): void => {
    if (disabled || !canBranch) return;
    setBranchOpen(true);
  };
  const canRegenerate =
    !isUser &&
    !disabled &&
    Boolean(onRetry) &&
    (message.status === 'error' || message.status === 'completed');
  const showCopy = !isUser && message.status === 'completed' && Boolean(message.content);
  const canFeedback = !isUser && message.status === 'completed' && Boolean(message.id && onFeedback);
  // v2.23：流式相位（搜索/阅读/检索/整理）由当前运行中的工具推导
  const streamPhase = React.useMemo(() => streamingPhase(message), [message]);
  // v1.0 M3：助手消息上屏/复制时剥离表情指令标签（标签驱动形象，不属于回复文本）
  // v1.6：同时剥离情绪信号尾块 JSON（流式半截也隐藏，防止协议文本闪入气泡）
  const displayContent = isUser
    ? message.content
    : stripEmotionSignalBlock(stripExpressionDirectives(message.content));
  // v2.27：正文角标只在已完成消息上启用，流式期间保持原文避免半截标记闪烁
  const citationIndexes = React.useMemo(
    () => new Set(message.citations.map((citation, index) => citation.citeIndex ?? index + 1)),
    [message.citations],
  );
  const canCite = !isUser && message.status === 'completed';

  return (
    <div
      className={cn(
        'message-enter group/msg flex gap-3 px-4 py-4',
        isUser && 'flex-row-reverse',
        highlighted && 'rounded-md ring-2 ring-primary/40',
      )}
      data-testid={`message-${message.id || 'pending'}`}
      data-message-id={message.id || undefined}
      data-highlighted={highlighted ? 'true' : undefined}
      data-role={message.role}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (disabled || !canBranch) return;
        if (target.closest('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        setBranchOpen(true);
      }}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium',
          isUser
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary/10 text-primary ring-1 ring-primary/15',
        )}
        aria-hidden
      >
        {isUser ? t('chatMessages.you') : 'AI'}
      </div>
      <div
        className={cn('min-w-0 flex-1 space-y-1.5', isUser && 'flex flex-col items-end')}
      >
        <div className={cn('flex items-center gap-2', isUser && 'flex-row-reverse')}>
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? t('chatMessages.you') : assistantName}
          </span>
          {!isUser && streamTiming && <FirstTokenMetric timing={streamTiming} />}
          {message.status === 'stopped' && <Badge variant="warning">{t('chatMessages.stopped')}</Badge>}
        </div>

        {!isUser && message.toolTrace.length > 0 && (
          <ToolTrace trace={message.toolTrace} live={message.status === 'streaming'} />
        )}

        {!isUser && agentCard && <AgentRunCard state={agentCard.state} runId={agentCard.runId} />}

        {isUser ? (
          <UserBody message={message} onResend={onResend} disabled={disabled} />
        ) : (
          <MarkdownContent content={displayContent} citations={canCite ? citationIndexes : undefined} />
        )}

        {!isUser && message.status === 'streaming' && streamTiming && (
          <StreamingProgress timing={streamTiming} phase={streamPhase} />
        )}

        {message.status === 'streaming' && (
          <span className="stream-caret" aria-hidden="true" data-testid="stream-caret" />
        )}

        {message.status === 'error' && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
            data-testid="message-error"
          >
            <p>
              {t('chatMessages.generateFailed', {
                reason: sys(message.errorMessage) || sys(message.errorCode) || t('chatMessages.unknownError'),
              })}
            </p>
          </div>
        )}

        {(showCopy || canRegenerate || canFeedback || canBranch) && (
          <MessageActions
            message={message}
            content={displayContent}
            canBranch={canBranch}
            canRegenerate={canRegenerate}
            canFeedback={canFeedback}
            disabled={disabled}
            onOpenBranch={openBranch}
            onRetry={onRetry}
            onFeedback={onFeedback}
          />
        )}
        <CitationsList message={message} />
        {/* v2.23：本轮 token 用量（悬停看输入/输出拆分） */}
        {!isUser && message.status === 'completed' && (message.totalTokens ?? 0) > 0 && (
          <p
            className="text-[11px] text-muted-foreground/70"
            data-testid="message-token-usage"
            title={t('chatMessages.turnTokensDetail', {
              prompt: message.promptTokens ?? 0,
              completion: message.completionTokens ?? 0,
              total: message.totalTokens ?? 0,
            })}
          >
            {t('chatMessages.turnTokens', {
              count: (message.totalTokens ?? 0).toLocaleString(),
            })}
          </p>
        )}
      </div>
      {conversationId && branchOpen && (
        <MessageBranchDialog
          conversationId={conversationId}
          open={branchOpen}
          onOpenChange={setBranchOpen}
          defaultGoal={message.content}
        />
      )}
    </div>
  );
}
