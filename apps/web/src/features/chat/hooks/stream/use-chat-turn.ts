'use client';

import * as React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@wbfm/shared/types';
import type { RecalledMemoryPayload } from '@wbfm/shared/api';
import type { useChatStream } from '@/lib/hooks/chat';
import type { ChatSessionVoice, PendingToolConfirmation } from '../../types/chat-session.types';
import type { useAgentTaskTurn } from '../use-agent-task-turn';
import type { useChatLiveGraph } from '../use-chat-live-graph';
import {
  buildStreamInput,
  buildTurnMessages,
  markStreamingAssistantStopped,
  pendingMessage,
} from '../use-chat-session-helpers';
import { createStreamHandlers } from './use-chat-stream-handlers';

export interface TurnTiming {
  startTiming: () => void;
  markFirstToken: () => void;
  queueDelta: (text: string) => void;
  flushPendingDelta: () => void;
  settleTiming: () => void;
  resetStream: () => void;
}

export interface UseChatTurnParams {
  assistantId: string;
  conversationId: string | null;
  /** historyQuery.data ?? [] */
  historyMessages: Message[];
  live: Message[] | null;
  setLive: Dispatch<SetStateAction<Message[] | null>>;
  setRecalledMemories: Dispatch<SetStateAction<RecalledMemoryPayload[]>>;
  setPendingConfirmation: Dispatch<SetStateAction<PendingToolConfirmation | null>>;
  onConversationCreated: (id: string) => void;
  queryClient: QueryClient;
  streamSend: ReturnType<typeof useChatStream>['send'];
  streamStop: () => void;
  streaming: boolean;
  voice?: ChatSessionVoice;
  taskTurn: ReturnType<typeof useAgentTaskTurn>;
  liveGraph: ReturnType<typeof useChatLiveGraph>;
  patchLastAssistant: (patch: Partial<Message>) => void;
  timing: TurnTiming;
}

/**
 * v4.13：普通流式回合的发送/重试/停止与计时编排。
 * 任务模式（useAgentTaskTurn）仍由会话 hook 直接委托。
 */
export function useChatTurn(params: UseChatTurnParams) {
  const {
    assistantId,
    conversationId,
    historyMessages,
    live,
    setLive,
    setRecalledMemories,
    setPendingConfirmation,
    onConversationCreated,
    queryClient,
    streamSend,
    streamStop,
    streaming,
    voice,
    taskTurn,
    liveGraph,
    patchLastAssistant,
    timing,
  } = params;
  const {
    startTiming,
    markFirstToken,
    queueDelta,
    flushPendingDelta,
    settleTiming,
    resetStream,
  } = timing;

  const runTurn = React.useCallback(
    (options: { content: string; regenerate: boolean; attachments?: string[] }) => {
      const { content, regenerate, attachments = [] } = options;
      startTiming();
      setRecalledMemories([]);
      setPendingConfirmation(null);
      const assistantMessage: Message = {
        ...pendingMessage('assistant', ''),
        status: 'streaming',
      };

      setLive((prev) =>
        buildTurnMessages(prev ?? historyMessages, assistantMessage, {
          content,
          regenerate,
          attachments,
        }),
      );

      const handlers = createStreamHandlers({
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
        voice,
        queryClient,
      });

      void streamSend(
        buildStreamInput({
          assistantId,
          conversationId,
          content,
          attachments,
          regenerate,
          ttsEnabled: voice?.ttsEnabled ?? false,
        }),
        handlers,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      assistantId,
      conversationId,
      historyMessages,
      onConversationCreated,
      queryClient,
      streamSend,
      voice,
      startTiming,
      markFirstToken,
      queueDelta,
      flushPendingDelta,
      settleTiming,
    ],
  );

  const send = React.useCallback(
    (content: string, attachmentIds?: string[]) =>
      runTurn({ content, regenerate: false, attachments: attachmentIds }),
    [runTurn],
  );

  const retry = React.useCallback(() => {
    if (streaming) return;
    const source = live ?? historyMessages;
    const lastUser = [...source].reverse().find((m) => m.role === 'user');
    if (!lastUser || !conversationId) return;
    const lastAssistant = [...source].reverse().find((m) => m.role === 'assistant');
    // v1.4 任务模式：用户消息不落 messages 表（仅 live+agent_runs），普通 regenerate
    // 会报「没有可重新生成的用户消息」；挂着协作卡的失败回复直接重新发起协作
    if (lastAssistant && taskTurn.agentCards[lastAssistant.id]) {
      resetStream();
      void taskTurn.start(lastUser.content, { regenerate: true });
      return;
    }
    runTurn({ content: lastUser.content, regenerate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTurn, streaming, live, historyMessages, conversationId, taskTurn, resetStream]);

  /** 主动停止：中断请求，并把本地仍在流式的助手消息标记为已停止 */
  const stop = React.useCallback(() => {
    liveGraph.stop();
    streamStop();
    taskTurn.stop();
    flushPendingDelta();
    settleTiming();
    voice?.cancelPlayback?.();
    setPendingConfirmation(null);
    setLive((prev) => markStreamingAssistantStopped(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamStop, taskTurn, voice, flushPendingDelta, settleTiming]);

  return { runTurn, send, retry, stop };
}
