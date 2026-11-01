'use client';

import * as React from 'react';
import type { Conversation } from '@wbfm/shared/types';
import { useToast } from '@/components/common/toast';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

export interface ChatDeepLinkOptions {
  /** 深链会话 id（null=无深链） */
  conversationId: string | null;
  /** 解析成功后的应用动作（切助手/会话/高亮消息由页面负责） */
  onConversation: (conversation: Conversation) => void;
}

/**
 * v2.6 M4：`/chat?conversation=<id>` 深链解析。
 * 只负责取会话并交给页面；会话已删除时给出可读提示，不阻断普通对话。
 */
export function useChatDeepLink({ conversationId, onConversation }: ChatDeepLinkOptions): void {
  const toast = useToast();
  const { t } = useI18n();
  const apply = React.useRef(onConversation);
  apply.current = onConversation;
  const toastRef = React.useRef(toast);
  toastRef.current = toast;
  const tRef = React.useRef(t);
  tRef.current = t;

  React.useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    void apiGet<Conversation>(API.conversation(conversationId))
      .then((conversation) => {
        if (!cancelled) apply.current(conversation);
      })
      .catch(() => {
        if (!cancelled) toastRef.current.error(tRef.current('memory.sourceMissing'));
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);
}
