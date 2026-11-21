'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@wbfm/shared/types';
import type { RecalledMemoryPayload } from '@wbfm/shared/api';
import { useMessages } from '@/lib/hooks/chat';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useChatStream } from '@/lib/hooks/chat';
import { useAgentTaskTurn } from './use-agent-task-turn';
import type { AgentCardEntry } from '@/features/agent-collab';
import { patchLastAssistantMessage } from '../base/live-message-utils';
import type { ChatSession, ChatSessionVoice, PendingLocalSearchStart, PendingToolConfirmation } from '../types/chat-session.types';
import { useStreamFrame } from './use-stream-frame';
import { useChatLiveGraph } from './use-chat-live-graph';
import { useChatTurn } from './stream';
import { useLocalSearchStart } from './local-search/use-local-search-start';

import {
  appendAssistantDelta,
  buildTurnMessages,
  applyMessageFeedback,
  pendingMessage,
  useToolConfirmation,
} from './use-chat-session-helpers';

export type { ChatSession, ChatSessionVoice, PendingLocalSearchStart, PendingToolConfirmation } from '../types/chat-session.types';

/** v1.4 任务模式：助手消息 id → 协作泳道卡（live only，历史在任务中心查看） */
export type { AgentCardEntry };

/**
 * 对话会话状态：历史消息来自 React Query，流式期间用本地 live 列表接管；
 * 新会话由后端创建后通过 onConversationCreated 回传 conversationId。
 * v4.13：SSE 处理器与普通回合编排分别下沉到 use-chat-stream-handlers / use-chat-turn。
 */
export function useChatSession(
  assistantId: string,
  conversationId: string | null,
  onConversationCreated: (id: string) => void,
  voice?: ChatSessionVoice,
): ChatSession {
  const historyQuery = useMessages(conversationId);
  const queryClient = useQueryClient();
  const { send: streamSend, stop: streamStop, streaming: chatStreaming } = useChatStream();
  const [live, setLive] = React.useState<Message[] | null>(null);
  const [recalledMemories, setRecalledMemories] = React.useState<RecalledMemoryPayload[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = React.useState<PendingToolConfirmation | null>(null);
  const [pendingLocalSearch, setPendingLocalSearch] = React.useState<PendingLocalSearchStart | null>(null);
  const liveGraph = useChatLiveGraph(conversationId);

  // v2.4 M5 / P1-4：delta 按 rAF 合帧 + 本轮计时（协作者外迁，行为不变）
  const appendDelta = React.useCallback((text: string) => {
    setLive((prev) => appendAssistantDelta(prev, text));
  }, []);
  const {
    timing: streamTiming,
    startTiming,
    markFirstToken,
    settleTiming,
    queueDelta,
    flushPendingDelta,
    resetStream,
  } = useStreamFrame(appendDelta);

  const patchLastAssistant = React.useCallback(
    (patch: Partial<Message>) => {
      setLive((prev) => patchLastAssistantMessage(prev, patch));
    },
    [],
  );

  const taskTurn = useAgentTaskTurn({
    assistantId,
    conversationId,
    onConversationCreated,
    pushTurn: (content, regenerate = false) => {
      setRecalledMemories([]);
      setPendingConfirmation(null);
      setPendingLocalSearch(null);
      // 任务消息不入 messages 表，需本地唯一 id 挂接泳道卡（pendingMessage 默认空 id，
      // 多轮任务会同挂 '' 键串卡，并使失败重试的任务卡判据失效）
      const assistantMessage: Message = {
        ...pendingMessage('assistant', ''),
        id: `task-${crypto.randomUUID()}`,
        status: 'streaming',
      };
      setLive((prev) =>
        buildTurnMessages(prev ?? historyQuery.data ?? [], assistantMessage, {
          content,
          regenerate,
          attachments: [],
        }),
      );
      return assistantMessage.id;
    },
    patchAssistant: patchLastAssistant,
    onGateConfirm: setPendingConfirmation,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
    },
  });
  const streaming = chatStreaming || taskTurn.streaming;

  // 注意：不能在 conversationId 变化时自动清空 live——新会话首轮 meta 会回传
  // 新的 conversationId，自动清空会抹掉正在进行的流式消息；改由页面显式 reset。
  const reset = React.useCallback(() => {
    taskTurn.reset();
    resetStream();
    setLive(null);
    setRecalledMemories([]);
    setPendingConfirmation(null);
    setPendingLocalSearch(null);
    voice?.cancelPlayback?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, taskTurn, resetStream]);

  const baseMessages = live ?? historyQuery.data ?? [];

  const { send, retry, stop } = useChatTurn({
    assistantId,
    conversationId,
    historyMessages: historyQuery.data ?? [],
    live,
    setLive,
    setRecalledMemories,
    setPendingConfirmation,
    setPendingLocalSearch,
    onConversationCreated,
    queryClient,
    streamSend,
    streamStop,
    streaming,
    voice,
    taskTurn,
    liveGraph,
    patchLastAssistant,
    timing: {
      startTiming,
      markFirstToken,
      queueDelta,
      flushPendingDelta,
      settleTiming,
      resetStream,
    },
  });

  /** v1.4 任务模式：委托 useAgentTaskTurn（建会话→建行→协作 SSE→终态对账） */
  const sendTask = React.useCallback((content: string, options?: { regenerate?: boolean }) => {
    // 任务轮不走普通流式计时，清掉上一轮首字指标，避免末条助手消息误挂旧指标
    resetStream();
    return taskTurn.start(content, options);
  }, [taskTurn, resetStream]);

  const applyFeedback = React.useCallback(
    (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => {
      setLive((prev) => applyMessageFeedback(prev, messageId, feedback, feedbackAt));
    },
    [],
  );

  const confirmTool = useToolConfirmation({
    pending: pendingConfirmation,
    conversationId,
    assistantId,
    clearPending: () => setPendingConfirmation(null),
    clearTaskGate: taskTurn.clearGate,
  });
  const localSearchStart = useLocalSearchStart({
    pending: pendingLocalSearch,
    clearPending: () => setPendingLocalSearch(null),
  });

  return {
    messages: baseMessages,
    streaming,
    streamTiming,
    recalledMemories,
    pendingConfirmation,
    localSearchStart: {
      pending: pendingLocalSearch,
      running: localSearchStart.running,
      canAutoStart: localSearchStart.canAutoStart,
      start: localSearchStart.start,
      cancel: localSearchStart.cancel,
    },
    agentCards: taskTurn.agentCards,
    send,
    sendTask,
    retry,
    stop,
    reset,
    applyFeedback,
    confirmTool,
  };
}
