import { ApiError, type TokenUsage } from '@wbfm/shared';
import { ProviderError } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget } from './model-resolver';
import { buildChatMessages, HISTORY_MESSAGE_LIMIT } from './prompt';
import type { OrchestratorEvent, RagContext, StreamChatInput } from './types';

function normalizeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof ProviderError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: '对话生成失败，请稍后重试' };
}

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);

  return {
    async *streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
      const assistant = assistants.get(input.assistantId);
      const conversation = input.conversationId
        ? conversations.get(input.conversationId)
        : conversations.create(assistant.id);

      conversations.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: input.content,
      });
      const assistantMessage = conversations.appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
      });
      yield {
        event: 'meta',
        data: { messageId: assistantMessage.id, conversationId: conversation.id },
      };

      let target;
      let retrieved: RagContext | null = null;
      try {
        target = resolveChatTarget(deps, assistant);
        if (input.retrieve && assistant.knowledgeBaseId) {
          retrieved = await input.retrieve(input.content, assistant, input.signal);
          if (retrieved?.citations.length) {
            yield { event: 'citations', data: { citations: retrieved.citations } };
          }
        }
      } catch (error) {
        // RAG 阶段中断与流式阶段语义一致：已生成为空，落 stopped 并正常收尾
        if (input.signal?.aborted) {
          conversations.stopMessage(assistantMessage.id, '');
          yield { event: 'done', data: { content: '', usage: null } };
          return;
        }
        const failure = normalizeFailure(error);
        conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
        yield { event: 'error', data: failure };
        return;
      }

      // 排除本轮流式占位（content 为空），避免空 assistant 消息发给上游
      const history = conversations
        .recentMessages(conversation.id, HISTORY_MESSAGE_LIMIT)
        .filter((m) => m.id !== assistantMessage.id);
      const chatMessages = buildChatMessages(assistant, history, retrieved ?? null);
      let full = '';
      let usage: TokenUsage | null = null;

      try {
        for await (const chunk of target.provider.chatStream({
          model: target.model.modelId,
          messages: chatMessages,
          temperature: assistant.temperature,
          topP: assistant.topP,
          maxTokens: assistant.maxTokens ?? undefined,
          signal: input.signal,
        })) {
          if (chunk.delta) {
            full += chunk.delta;
            yield { event: 'delta', data: { content: chunk.delta } };
          }
          if (chunk.usage) usage = chunk.usage;
        }
      } catch (error) {
        if (input.signal?.aborted) {
          conversations.stopMessage(assistantMessage.id, full);
          yield { event: 'done', data: { content: full, usage } };
          return;
        }
        const failure = normalizeFailure(error);
        conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
        yield { event: 'error', data: failure };
        return;
      }

      conversations.completeMessage(assistantMessage.id, full, usage);
      yield { event: 'done', data: { content: full, usage } };
    },
  };
}

export type ChatOrchestrator = ReturnType<typeof createChatOrchestrator>;
