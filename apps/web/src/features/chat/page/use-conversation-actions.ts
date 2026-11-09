'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useConversationMutations } from '@/lib/hooks/chat';

/**
 * v2.35：会话重命名/删除的提交与提示（从 chat-page 抽出，控制页面体量）。
 * 删除当前会话时通过 onActiveRemoved 通知页面清空选中态。
 */
export function useConversationActions(
  conversationId: string | null,
  onActiveRemoved: (id: string) => void,
) {
  const mutations = useConversationMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const onRemovedRef = React.useRef(onActiveRemoved);
  onRemovedRef.current = onActiveRemoved;

  // Electron 渲染进程不支持 window.prompt，统一使用应用内弹窗
  const submitRename = async (id: string, title: string): Promise<boolean> => {
    try {
      await mutations.rename.mutateAsync({ id, title });
      return true;
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.renameFailed' }));
      return false;
    }
  };

  const remove = async (conversation: { id: string; title: string }): Promise<void> => {
    if (
      !(await confirm({
        title: t('chat.deleteConversationTitle'),
        description: t('chat.deleteConversationConfirm', { title: conversation.title }),
        confirmText: t('common.actions.delete'),
        cancelText: t('common.actions.cancel'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(conversation.id);
      if (conversationId === conversation.id) onRemovedRef.current(conversation.id);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.deleteFailed' }));
    }
  };

  return { submitRename, remove };
}
