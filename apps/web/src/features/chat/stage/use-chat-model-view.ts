'use client';

import * as React from 'react';
import type { Assistant, Conversation, ProviderModel } from '@wbfm/shared/types';

interface ModelViewArgs {
  assistant: Assistant | null;
  conversation: Conversation | null;
  defaultChatModelId: string | null | undefined;
  models: readonly ProviderModel[] | undefined;
}

/**
 * v2.20 M5：聊天页的生效模型视图（会话覆盖 > 助手绑定 > 系统默认）。
 * 从 ChatPage 外迁，保持 hasChatModel/visionEnabled 旧降级口径。
 */
export function useChatModelView({
  assistant,
  conversation,
  defaultChatModelId,
  models,
}: ModelViewArgs) {
  const effectiveModelId = conversation?.modelId ?? assistant?.modelId ?? defaultChatModelId ?? null;
  const model = models?.find((item) => item.id === effectiveModelId) ?? null;

  const hasChatModel = !effectiveModelId
    ? false
    : models
      ? Boolean(model?.capabilities.includes('chat'))
      : Boolean(conversation?.modelId || assistant?.modelId);

  const visionEnabled = Boolean(model?.capabilities.includes('vision'));

  return React.useMemo(
    () => ({ effectiveModelId, hasChatModel, visionEnabled }),
    [effectiveModelId, hasChatModel, visionEnabled],
  );
}
