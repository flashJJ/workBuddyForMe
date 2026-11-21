'use client';

import type { Conversation } from '@wbfm/shared/types';
import { useConversationMutations } from '@/lib/hooks/chat';
import { ConversationBudgetDialog } from './conversation-budget-dialog';

/** v4.18：会话预算弹窗容器（自持 mutation，避免对话页继续膨胀） */
export function ConversationBudgetHost({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setTokenBudget } = useConversationMutations();
  const submit = async (id: string, tokenBudget: number | null) => {
    try {
      await setTokenBudget.mutateAsync({ id, tokenBudget });
      return true;
    } catch {
      return false;
    }
  };
  return (
    <ConversationBudgetDialog
      conversation={open ? conversation : null}
      onOpenChange={onOpenChange}
      onSubmit={submit}
    />
  );
}
