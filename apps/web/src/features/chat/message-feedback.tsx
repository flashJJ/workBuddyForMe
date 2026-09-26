'use client';

import * as React from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Message, MessageFeedback } from '@wbfm/shared';
import { useMessageFeedback } from '@/lib/hooks/use-message-feedback';

interface Props {
  message: Message;
  disabled?: boolean;
  /** 提交成功后同步父级本地视图 */
  onApplied: (messageId: string, feedback: MessageFeedback | null, feedbackAt: string | null) => void;
}

/** v0.5 P1-2：助手回答下方的 👍/👎；再次点击同项取消评价 */
export function MessageFeedbackButtons({ message, disabled, onApplied }: Props) {
  const mutation = useMessageFeedback();

  const vote = (value: MessageFeedback) => {
    if (mutation.isPending || !message.conversationId) return;
    const next = message.feedback === value ? null : value;
    mutation.mutate(
      { conversationId: message.conversationId, messageId: message.id, feedback: next },
      {
        onSuccess: (updated) => onApplied(updated.id, updated.feedback, updated.feedbackAt),
      },
    );
  };

  const baseClass =
    'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
  const activeClass = 'bg-primary/10 text-primary';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        title="有帮助"
        aria-label="有帮助"
        aria-pressed={message.feedback === 'up'}
        data-testid="feedback-up"
        disabled={disabled || mutation.isPending}
        className={`${baseClass} ${message.feedback === 'up' ? activeClass : ''}`}
        onClick={() => vote('up')}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="没帮助"
        aria-label="没帮助"
        aria-pressed={message.feedback === 'down'}
        data-testid="feedback-down"
        disabled={disabled || mutation.isPending}
        className={`${baseClass} ${message.feedback === 'down' ? activeClass : ''}`}
        onClick={() => vote('down')}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
