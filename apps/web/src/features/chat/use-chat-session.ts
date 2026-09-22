'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Citation, ContentPart, Message, SsePayloadMap, ToolTraceEntry } from '@wbfm/shared';
import { useMessages } from '@/lib/hooks/use-conversations';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useChatStream } from '@/lib/hooks/use-chat-stream';

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
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso(),
  };
}

export interface ChatSession {
  messages: Message[];
  streaming: boolean;
  send: (content: string, attachmentIds?: string[]) => void;
  /** 重新生成最后一条助手回复（沿用上一条用户消息） */
  retry: () => void;
  stop: () => void;
  /** 切换会话/助手时清空本地流式视图，回到服务端历史 */
  reset: () => void;
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

  // 注意：不能在 conversationId 变化时自动清空 live——新会话首轮 meta 会回传
  // 新的 conversationId，自动清空会抹掉正在进行的流式消息；改由页面显式 reset。
  const reset = React.useCallback(() => setLive(null), []);

  const baseMessages = live ?? historyQuery.data ?? [];

  const patchLastAssistant = (patch: Partial<Message>) => {
    setLive((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i]!.role === 'assistant') {
          next[i] = { ...next[i]!, ...patch };
          break;
        }
      }
      return next;
    });
  };

  const upsertToolTrace = (entry: ToolTraceEntry) => {
    setLive((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i]!.role === 'assistant') {
          const trace = next[i]!.toolTrace ?? [];
          const idx = trace.findIndex((t) => t.callId === entry.callId);
          const nextTrace = idx === -1 ? [...trace, entry] : trace.map((t, j) => (j === idx ? entry : t));
          next[i] = { ...next[i]!, toolTrace: nextTrace };
          break;
        }
      }
      return next;
    });
  };

  const runTurn = React.useCallback(
    (options: { content: string; regenerate: boolean; attachments?: string[] }) => {
      const { content, regenerate, attachments = [] } = options;
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
            });
            return;
          }
          // end：用 start 阶段记录的 startedAt 保留真实开始时间
          setLive((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i -= 1) {
              if (next[i]!.role === 'assistant') {
                const trace = next[i]!.toolTrace ?? [];
                const previous = trace.find((t) => t.callId === data.callId);
                const entry: ToolTraceEntry = {
                  callId: data.callId,
                  tool: data.tool,
                  argsSummary: previous?.argsSummary ?? '',
                  status: data.status,
                  durationMs: data.durationMs,
                  resultSummary: data.resultSummary,
                  ...(data.status === 'error' && data.error ? { error: data.error } : {}),
                  startedAt: previous?.startedAt ?? nowIso(),
                };
                const idx = trace.findIndex((t) => t.callId === data.callId);
                const nextTrace = idx === -1 ? [...trace, entry] : trace.map((t, j) => (j === idx ? entry : t));
                next[i] = { ...next[i]!, toolTrace: nextTrace };
                break;
              }
            }
            return next;
          });
        },
        onDone: (data: SsePayloadMap['done']) => {
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

  return { messages: baseMessages, streaming, send, retry, stop, reset };
}
