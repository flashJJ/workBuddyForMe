'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Citation, Message } from '@wbfm/shared/types';
import type { RecalledMemoryPayload, SsePayloadMap } from '@wbfm/shared/api';
import { useMessages } from '@/lib/hooks/use-conversations';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { apiPost } from '@/lib/api/client';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import {
  applyToolSubsteps,
  applyToolTraceEnd,
  applyToolTraceStart,
  patchLastAssistantMessage,
} from './live-message-utils';
import type { ChatSessionVoice, PendingToolConfirmation } from './chat-session.types';
import {
  appendAssistantDelta,
  buildStreamInput,
  buildTurnMessages,
  completedPatch,
  confirmationFromPayload,
  applyMessageFeedback,
  markStreamingAssistantStopped,
  pendingMessage,
} from './use-chat-session-helpers';

export type { ChatSessionVoice, PendingToolConfirmation } from './chat-session.types';

export interface ChatSession {
  messages: Message[];
  streaming: boolean;
  /** 本轮召回的长期记忆（回答上方「参考了 N 条记忆」提示），下轮开始时清空 */
  recalledMemories: RecalledMemoryPayload[];
  /** v0.6 M2：当前待确认的工具调用（null=无弹窗） */
  pendingConfirmation: PendingToolConfirmation | null;
  send: (content: string, attachmentIds?: string[]) => void;
  /** 重新生成最后一条助手回复（沿用上一条用户消息） */
  retry: () => void;
  stop: () => void;
  /** 切换会话/助手时清空本地流式视图，回到服务端历史 */
  reset: () => void;
  /** 反馈提交成功后同步到本地 live 视图（live 为空时由 React Query 刷新生效） */
  applyFeedback: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
  /** v0.6 M2：提交工具确认决策；返回 false 表示提交失败（调用方提示并保持弹窗） */
  confirmTool: (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => Promise<boolean>;
}

/**
 * 对话会话状态：历史消息来自 React Query，流式期间用本地 live 列表接管；
 * 新会话由后端创建后通过 onConversationCreated 回传 conversationId。
 */
export function useChatSession(
  assistantId: string,
  conversationId: string | null,
  onConversationCreated: (id: string) => void,
  voice?: ChatSessionVoice,
): ChatSession {
  const historyQuery = useMessages(conversationId);
  const queryClient = useQueryClient();
  const { send: streamSend, stop: streamStop, streaming } = useChatStream();
  const [live, setLive] = React.useState<Message[] | null>(null);
  const [recalledMemories, setRecalledMemories] = React.useState<RecalledMemoryPayload[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = React.useState<PendingToolConfirmation | null>(null);

  // 注意：不能在 conversationId 变化时自动清空 live——新会话首轮 meta 会回传
  // 新的 conversationId，自动清空会抹掉正在进行的流式消息；改由页面显式 reset。
  const reset = React.useCallback(() => {
    setLive(null);
    setRecalledMemories([]);
    setPendingConfirmation(null);
    voice?.cancelPlayback?.();
  }, [voice]);

  const baseMessages = live ?? historyQuery.data ?? [];

  const patchLastAssistant = (patch: Partial<Message>) => {
    setLive((prev) => patchLastAssistantMessage(prev, patch));
  };

  const runTurn = React.useCallback(
    (options: { content: string; regenerate: boolean; attachments?: string[] }) => {
      const { content, regenerate, attachments = [] } = options;
      setRecalledMemories([]);
      setPendingConfirmation(null);
      const assistantMessage: Message = {
        ...pendingMessage('assistant', ''),
        status: 'streaming',
      };

      setLive((prev) =>
        buildTurnMessages(prev ?? historyQuery.data ?? [], assistantMessage, {
          content,
          regenerate,
          attachments,
        }),
      );

      const handlers = {
        onMeta: (data: SsePayloadMap['meta']) => {
          patchLastAssistant({ id: data.messageId, conversationId: data.conversationId });
          if (!conversationId && !regenerate) onConversationCreated(data.conversationId);
        },
        onDelta: (data: SsePayloadMap['delta']) => {
          setLive((prev) => appendAssistantDelta(prev, data.content));
        },
        onCitations: (data: SsePayloadMap['citations']) => {
          const citations: Citation[] = data.citations;
          patchLastAssistant({ citations });
        },
        onMemories: (data: SsePayloadMap['memories']) => {
          setRecalledMemories(data.memories);
        },
        onTool: (data: SsePayloadMap['tool']) => {
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
        onVoiceAudio: (data: SsePayloadMap['voice_audio']) => voice?.onAudio?.(data),
        onVoiceState: (data: SsePayloadMap['voice_state']) => voice?.onVoiceState?.(data),
        onDone: (data: SsePayloadMap['done']) => {
          setPendingConfirmation(null);
          patchLastAssistant(completedPatch(data));
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
        },
        onError: (data: SsePayloadMap['error']) => {
          setPendingConfirmation(null);
          patchLastAssistant({ status: 'error', errorCode: data.code, errorMessage: data.message });
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
        },
      };

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
    [assistantId, conversationId, historyQuery.data, onConversationCreated, queryClient, streamSend, voice],
  );

  const send = React.useCallback(
    (content: string, attachmentIds?: string[]) =>
      runTurn({ content, regenerate: false, attachments: attachmentIds }),
    [runTurn],
  );

  const retry = React.useCallback(() => {
    if (streaming) return;
    const source = live ?? historyQuery.data ?? [];
    const lastUser = [...source].reverse().find((m) => m.role === 'user');
    if (lastUser && conversationId) runTurn({ content: lastUser.content, regenerate: true });
  }, [runTurn, streaming, live, historyQuery.data, conversationId]);

  /** 主动停止：中断请求，并把本地仍在流式的助手消息标记为已停止 */
  const stop = React.useCallback(() => {
    streamStop();
    voice?.cancelPlayback?.();
    setPendingConfirmation(null);
    setLive((prev) => markStreamingAssistantStopped(prev));
  }, [streamStop, voice]);

  const applyFeedback = React.useCallback(
    (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => {
      setLive((prev) => applyMessageFeedback(prev, messageId, feedback, feedbackAt));
    },
    [],
  );

  /** 提交 HITL 决策：成功清空弹窗；失败（超时已被服务端拒绝 → 404）返回 false，调用方提示并保持弹窗 */
  const confirmTool = React.useCallback(
    async (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task'): Promise<boolean> => {
      const pending = pendingConfirmation;
      if (!pending) return false;
      const extra =
        remember === 'task'
          ? { remember, taskScope: conversationId ?? '' }
          : remember
            ? { remember, assistantId }
            : {};
      try {
        await apiPost(API.toolConfirm, { callId: pending.callId, tool: pending.tool, action, ...extra });
        setPendingConfirmation(null);
        return true;
      } catch {
        return false;
      }
    },
    [pendingConfirmation, assistantId, conversationId],
  );

  return {
    messages: baseMessages,
    streaming,
    recalledMemories,
    pendingConfirmation,
    send,
    retry,
    stop,
    reset,
    applyFeedback,
    confirmTool,
  };
}
