'use client';

import type { Conversation } from '@wbfm/shared/types';
import { useAssistants } from '@/lib/hooks/assistant';
import { useAllModels } from '@/lib/hooks/provider';
import { useConversationMutations } from '@/lib/hooks/chat';
import { ConversationBudgetDialog } from './conversation-budget-dialog';

/** v4.18：会话预算弹窗容器；v4.19：附带会话级备用模型覆盖 */
export function ConversationBudgetHost({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateConversation } = useConversationMutations();
  const { data: assistants } = useAssistants();
  const { data: models } = useAllModels();
  const assistant = assistants?.find((item) => item.id === conversation?.assistantId);
  const fallbackOptions = (models ?? [])
    .filter((model) => model.capabilities.includes('chat'))
    .map((model) => ({
      id: model.id,
      label: `${model.displayName}（${model.modelId}）`,
    }));
  const assistantFallbackCount =
    assistant?.fallbackModelIds?.length ?? (assistant?.fallbackModelId ? 1 : 0);

  const submit = async (
    id: string,
    tokenBudget: number | null,
    fallbackModelId: string | null,
  ) => {
    try {
      await updateConversation.mutateAsync({ id, tokenBudget, fallbackModelId });
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
      fallbackOptions={fallbackOptions}
      assistantFallbackCount={assistantFallbackCount}
    />
  );
}
