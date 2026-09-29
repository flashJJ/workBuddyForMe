'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Citation, ContentPart, Message, PermissionLevel, RecalledMemoryPayload, SsePayloadMap, ToolTraceEntry } from '@wbfm/shared';
import { useMessages } from '@/lib/hooks/use-conversations';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { apiPost } from '@/lib/api/client';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import {
  applyToolTraceEnd,
  patchLastAssistantMessage,
  upsertToolTraceEntry,
} from './live-message-utils';

/** v0.6 M2：待用户确认的工具调用（HITL 弹窗数据源） */
export interface PendingToolConfirmation {
  callId: string;
  tool: string;
  permission: PermissionLevel;
  argsSummary: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildUserParts(content: string, attachmentIds: string[]): ContentPart[] {
  const parts: ContentPart[] = [];
  if (content) parts.push({ type: 'text', text: content });
  for (const attachmentId of attachmentIds) parts.push({ type: 'image', attachmentId });
  return parts;
}

function pendingMessage(role: Message['role'], content: string): Message {
  return {
    id: '',
    conversationId: '',
    role,
    content,
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso(),
  };
}

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
  }, []);

  const baseMessages = live ?? historyQuery.data ?? [];

  const patchLastAssistant = (patch: Partial<Message>) => {
    setLive((prev) => patchLastAssistantMessage(prev, patch));
  };

  const upsertToolTrace = (entry: ToolTraceEntry) => {
    setLive((prev) => upsertToolTraceEntry(prev, entry));
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

      setLive((prev) => {
        const source = prev ?? historyQuery.data ?? [];
        if (regenerate) {
          // 去掉尾部旧助手消息（错误/已完成），挂上新的占位
          const trimmed = [...source];
          if (trimmed.length && trimmed[trimmed.length - 1]!.role === 'assistant') {
            trimmed.pop();
          }
          return [...trimmed, assistantMessage];
        }
        const userMessage: Message = {
          ...pendingMessage('user', content),
          contentParts: buildUserParts(content, attachments),
        };
        return [...source, userMessage, assistantMessage];
      });

      const handlers = {
        onMeta: (data: SsePayloadMap['meta']) => {
          patchLastAssistant({ id: data.messageId, conversationId: data.conversationId });
          if (!conversationId && !regenerate) onConversationCreated(data.conversationId);
        },
        onDelta: (data: SsePayloadMap['delta']) => {
          setLive((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + data.content };
            }
            return next;
          });
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
            upsertToolTrace({
              callId: data.callId,
              tool: data.tool,
              argsSummary: data.argsSummary,
              status: 'running',
              durationMs: 0,
              resultSummary: '执行中…',
              startedAt: nowIso(),
              ...(data.source ? { source: data.source } : {}),
              ...(data.permission ? { permission: data.permission } : {}),
            });
            return;
          }
          // end：用 start 阶段记录的 startedAt 保留真实开始时间
          setLive((prev) => applyToolTraceEnd(prev, data));
        },
        onToolConfirmationRequired: (data: SsePayloadMap['tool_confirmation_required']) => {
          // orchestrator 已挂起等待决策；弹窗由页面渲染
          setPendingConfirmation({
            callId: data.callId,
            tool: data.tool,
            permission: data.permission,
            argsSummary: data.argsSummary,
          });
        },
        onDone: (data: SsePayloadMap['done']) => {
          setPendingConfirmation(null);
          patchLastAssistant({
            status: 'completed',
            content: data.content,
            promptTokens: data.usage?.promptTokens ?? null,
            completionTokens: data.usage?.completionTokens ?? null,
            totalTokens: data.usage?.totalTokens ?? null,
          });
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
        {
          assistantId,
          ...(conversationId ? { conversationId } : {}),
          content,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(regenerate ? { regenerate: true } : {}),
        },
        handlers,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistantId, conversationId, historyQuery.data, onConversationCreated, queryClient, streamSend],
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
    setPendingConfirmation(null);
    setLive((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const item = next[i]!;
        if (item.role === 'assistant' && item.status === 'streaming') {
          next[i] = { ...item, status: 'stopped' };
          return next;
        }
      }
      return next;
    });
  }, [streamStop]);

  const applyFeedback = React.useCallback(
    (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => {
      setLive((prev) => {
        if (!prev) return prev;
        return prev.map((m) =>
          m.id === messageId ? { ...m, feedback, feedbackAt } : m,
        );
      });
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
