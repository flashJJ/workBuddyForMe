'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ChatSession } from '../../types/chat-session.types';
import { ToolConfirmDialog } from '../tool-confirm-dialog';

/** v4.18：工具确认弹窗容器（提交态与失败提示从对话页拆出） */
export function ToolConfirmHost({
  session,
  conversationId,
}: {
  session: ChatSession;
  conversationId: string | null;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => {
    if (submitting) return false;
    setSubmitting(true);
    try {
      const ok = await session.confirmTool(action, remember);
      if (!ok) {
        toast.error(t('toast.toolConfirmSubmitFailed'));
        return false;
      }
      return true;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ToolConfirmDialog
      open={Boolean(session.pendingConfirmation)}
      tool={session.pendingConfirmation?.tool ?? ''}
      permission={session.pendingConfirmation?.permission ?? 'write'}
      argsSummary={session.pendingConfirmation?.argsSummary ?? ''}
      details={session.pendingConfirmation?.details}
      submitting={submitting}
      taskScopeAvailable={Boolean(conversationId || session.pendingConfirmation?.taskScope)}
      origin={session.pendingConfirmation?.taskScope ? 'agent' : undefined}
      onOpenChange={(open) => {
        // 不允许点遮罩/ESC 直接关闭而不做决策——必须显式拒绝
        if (!open && !submitting) void submit('deny');
      }}
      onSubmit={submit}
    />
  );
}
