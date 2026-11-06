'use client';

import * as React from 'react';
import { ArrowDown, Sparkles } from 'lucide-react';
import type { Message } from '@wbfm/shared/types';
import { Skeleton } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { AgentCardEntry } from '@/features/agent-collab';
import type { StreamTiming } from '../types/chat-session.types';
import { MessageItem } from './message-item';

interface Props {
  messages: Message[];
  /** v2.21：消息底部「从此分支」入口需要父会话 id */
  conversationId?: string | null;
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
  /** v2.23 空态示例 prompt：点击只填入输入框，不自动发送 */
  onUsePrompt?: (text: string) => void;
}

export function MessageList({
  messages,
  conversationId,
  assistantName,
  streaming,
  agentCards,
  onRetry,
  onResend,
  onFeedback,
  streamTiming,
  highlightMessageId,
  onHighlightMissing,
  onUsePrompt,
}: Props) {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const warnedRef = React.useRef<string | null>(null);
  // v2.23：滚离底部超过 200px 时浮出「回到底部」
  const [atBottom, setAtBottom] = React.useState(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 200);
  };

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
    // v2.23：首轮生成中给骨架屏，避免空态先闪一下；平时是品牌区 + 示例 prompt 卡
    if (streaming) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-3xl space-y-3" data-testid="message-skeleton">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-3xl text-center" data-testid="chat-empty-state">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-3 text-base font-semibold">{t('chatMessages.list.emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('chatMessages.list.emptyDescription')}
          </p>
          <p className="mt-6 text-[11px] font-medium tracking-wide text-muted-foreground">
            {t('chatMessages.list.promptsLabel')}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              t('chatMessages.list.promptPlan'),
              t('chatMessages.list.promptSummary'),
              t('chatMessages.list.promptSources'),
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onUsePrompt?.(prompt)}
                className="rounded-xl border bg-surface-2 px-3 py-3 text-left text-xs leading-relaxed text-muted-foreground shadow-1 transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-quint hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* v2.23：正文列限宽居中（最大 768px），超宽窗口不再贴边拉伸；上下边缘渐隐 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scroll-fade-y flex-1 overflow-y-auto"
        data-testid="message-list"
      >
        <div className="mx-auto w-full max-w-3xl py-2">
          {messages.map((message, index) => (
            <MessageItem
              key={message.id || `pending-${index}`}
              message={message}
              conversationId={conversationId}
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
        </div>
        <div ref={bottomRef} />
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          className="absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-surface-3 px-3 py-1.5 text-xs text-muted-foreground shadow-2 transition-colors duration-fast ease-out-quint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-testid="scroll-to-bottom"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {t('chatMessages.backToBottom')}
        </button>
      )}
    </div>
  );
}
