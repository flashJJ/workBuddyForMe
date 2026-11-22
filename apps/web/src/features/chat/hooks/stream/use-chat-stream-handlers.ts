'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Citation, Message } from '@wbfm/shared/types';
import type { RecalledMemoryPayload, SsePayloadMap } from '@wbfm/shared/api';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import {
  applyToolSubsteps,
  applyToolTraceEnd,
  applyToolTraceStart,
} from '../../base/live-message-utils';
import { applyMemoryNotices, completedPatch, confirmationFromPayload } from '../use-chat-session-helpers';
import type { ChatSessionVoice, PendingLocalSearchStart, PendingToolConfirmation } from '../../types/chat-session.types';
import type { useChatLiveGraph } from '../use-chat-live-graph';

export interface StreamHandlerContext {
  conversationId: string | null;
  regenerate: boolean;
  liveGraph: ReturnType<typeof useChatLiveGraph>;
  patchLastAssistant: (patch: Partial<Message>) => void;
  onConversationCreated: (id: string) => void;
  markFirstToken: () => void;
  queueDelta: (content: string) => void;
  flushPendingDelta: () => void;
  settleTiming: (ok?: boolean) => void;
  setLive: Dispatch<SetStateAction<Message[] | null>>;
  setRecalledMemories: Dispatch<SetStateAction<RecalledMemoryPayload[]>>;
  setPendingConfirmation: Dispatch<SetStateAction<PendingToolConfirmation | null>>;
  setPendingLocalSearch: Dispatch<SetStateAction<PendingLocalSearchStart | null>>;
  setBudgetWarning: Dispatch<SetStateAction<{ usedTokens: number; limitTokens: number; ratio: number } | null>>;
  voice?: ChatSessionVoice;
  queryClient: QueryClient;
}

/**
 * v4.13：流式会话的 SSE 事件处理器（meta/delta/tool/done/error/intent）。
 * 纯工厂，不持有状态；由 useChatTurn 在每轮发送时调用。
 */
export function createStreamHandlers(ctx: StreamHandlerContext) {
  const {
    conversationId,
    regenerate,
    liveGraph,
    patchLastAssistant,
    onConversationCreated,
    markFirstToken,
    queueDelta,
    flushPendingDelta,
    settleTiming,
    setLive,
    setRecalledMemories,
    setPendingConfirmation,
    setPendingLocalSearch,
    setBudgetWarning,
    voice,
    queryClient,
  } = ctx;

  return {
    onMeta: (data: SsePayloadMap['meta']) => {
      liveGraph.start(data);
      patchLastAssistant({ id: data.messageId, conversationId: data.conversationId });
      if (!conversationId && !regenerate) onConversationCreated(data.conversationId);
    },
    onDelta: (data: SsePayloadMap['delta']) => {
      markFirstToken();
      queueDelta(data.content);
    },
    onCitations: (data: SsePayloadMap['citations']) => {
      const citations: Citation[] = data.citations;
      patchLastAssistant({ citations });
    },
    onMemories: (data: SsePayloadMap['memories']) => {
      setRecalledMemories(data.memories);
    },
    onTool: (data: SsePayloadMap['tool']) => {
      liveGraph.tool(data);
      if (data.phase === 'start') {
        setLive((prev) => applyToolTraceStart(prev, data));
        return;
      }
      if (data.phase === 'substep') {
        // v0.8：flow 工具逐节点进度
        setLive((prev) => applyToolSubsteps(prev, data));
        return;
      }
      // end：用 start 阶段记录的 startedAt 保留真实开始时间
      setLive((prev) => applyToolTraceEnd(prev, data));
    },
    onToolConfirmationRequired: (data: SsePayloadMap['tool_confirmation_required']) => {
      // 编排器已挂起等待决策；弹窗由页面渲染
      setPendingConfirmation(confirmationFromPayload(data));
    },
    onSearchLocalStartRequired: (data: SsePayloadMap['search_local_start_required']) => {
      // 编排器已挂起本次搜索，等待启动/取消决策
      setPendingLocalSearch(data);
    },
    /** v4.18：自动切换备用模型，消息内展示可见提示 */
    onModelSwitched: (data: SsePayloadMap['model_switched']) => {
      patchLastAssistant({
        modelSwitch: {
          fromModelName: data.fromModelName,
          toModelName: data.toModelName,
          reason: data.reason,
          attempt: data.attempt,
        },
      });
    },
    /** v4.18：会话预算达到 80%，由对话页提示条展示 */
    onBudgetWarning: (data: SsePayloadMap['budget_warning']) => {
      setBudgetWarning(data);
    },
    onVoiceAudio: (data: SsePayloadMap['voice_audio']) => voice?.onAudio?.(data),
    onVoiceState: (data: SsePayloadMap['voice_state']) => voice?.onVoiceState?.(data),
    onDone: (data: SsePayloadMap['done']) => {
      liveGraph.complete(data);
      flushPendingDelta();
      settleTiming(true);
      setPendingConfirmation(null);
      setPendingLocalSearch(null);
      patchLastAssistant(completedPatch(data));
      setLive((prev) => applyMemoryNotices(prev, data.memoryNotices));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
      // v4.12：本轮意图与提示状态已落事件，通知上下文面板刷新
      void queryClient.invalidateQueries({ queryKey: ['events', 'chat'] });
    },
    onError: (data: SsePayloadMap['error']) => {
      liveGraph.fail(data);
      flushPendingDelta();
      settleTiming(false);
      setPendingConfirmation(null);
      setPendingLocalSearch(null);
      patchLastAssistant({ status: 'error', errorCode: data.code, errorMessage: data.message });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
      void queryClient.invalidateQueries({ queryKey: ['events', 'chat'] });
    },
  };
}
