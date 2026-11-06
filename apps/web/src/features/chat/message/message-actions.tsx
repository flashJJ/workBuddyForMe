'use client';

import * as React from 'react';
import { Check, Copy, RotateCw } from 'lucide-react';
import type { Message } from '@wbfm/shared/types';
import { copyText } from '@/lib/utils/clipboard';
import { useI18n } from '@/lib/i18n/use-i18n';
import { MessageBranchButton } from '@/features/branch';
import { MessageFeedbackButtons } from './message-feedback';

const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-out-quint hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface Props {
  message: Message;
  /** 已剥离表情/情绪指令的展示文本 */
  content: string;
  canBranch: boolean;
  canRegenerate: boolean;
  canFeedback: boolean;
  disabled?: boolean;
  onOpenBranch: () => void;
  onRetry?: () => void;
  onFeedback?: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
}

/**
 * v2.23 消息操作条：hover / 键盘 focus 时浮出，平时不占视觉重量。
 * 仍保留文字标签，保证无障碍名称与可读性（不依赖图标猜意图）。
 */
export function MessageActions({
  message,
  content,
  canBranch,
  canRegenerate,
  canFeedback,
  disabled,
  onOpenBranch,
  onRetry,
  onFeedback,
}: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = async () => {
    await copyText(content);
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 pt-0.5 opacity-0 transition-opacity duration-fast ease-out-quint focus-within:opacity-100 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
      data-testid="message-actions"
    >
      {canBranch && <MessageBranchButton onOpen={onOpenBranch} disabled={disabled} />}
      <button type="button" className={ACTION_CLASS} onClick={() => void copy()}>
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {copied ? t('chatMessages.copied') : t('common.actions.copy')}
      </button>
      {canRegenerate && (
        <button
          type="button"
          className={ACTION_CLASS}
          onClick={() => onRetry?.()}
          data-testid="regenerate-button"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t('chatMessages.regenerate')}
        </button>
      )}
      {canFeedback && onFeedback && (
        <MessageFeedbackButtons message={message} disabled={disabled} onApplied={onFeedback} />
      )}
    </div>
  );
}
