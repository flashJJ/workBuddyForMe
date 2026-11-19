import { ApiError } from '@wbfm/shared/errors';
import { createAssistantRepository } from '@wbfm/database';
import type { ServiceDeps } from '../../../services/base/deps';
import { createConversationService } from '../../../services/assistant/conversation-service';
import { resolveChatTarget } from '../model-resolver';
import { compactIfNeeded } from '../turn-context';

/**
 * v4.8 用户显式压缩：跳过水位阈值，折叠最旧约 60% 历史并写 context_condensed 事件。
 * 供上下文面板「立即压缩」调用；失败向上抛出，由 API 层转成可读错误。
 */
export function createContextCompactionService(deps: ServiceDeps) {
  return {
    async compactNow(
      conversationId: string,
    ): Promise<{ compactedTurns: number; summary: string | null }> {
      const conversations = createConversationService(deps);
      const conversation = conversations.get(conversationId);
      const assistant = createAssistantRepository(deps.db).findById(conversation.assistantId);
      if (!assistant) throw new ApiError('NOT_FOUND', '助手不存在，无法压缩上下文');
      const target = resolveChatTarget(deps, assistant, conversation.modelId ?? null);
      return compactIfNeeded({
        conversations,
        attachments: { loadImages: () => [] },
        conversation,
        assistant,
        target,
        toolDefs: [],
        lastCompletionTokens:
          conversations.lastAssistantUsage(conversationId)?.completionTokens ?? null,
        traceParent: null,
        events: deps.events,
        trigger: 'user_explicit',
        force: true,
      });
    },
  };
}

export type ContextCompactionService = ReturnType<typeof createContextCompactionService>;
