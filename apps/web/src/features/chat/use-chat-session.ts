'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Citation, Message, SsePayloadMap } from '@wbfm/shared';
import { useMessages } from '@/lib/hooks/use-conversations';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useChatStream } from '@/lib/hooks/use-chat-stream';

function nowIso(): string {
  return new Date().toISOString();
}

function pendingMessage(role: Message['role'], content: string): Message {
  return {
    id: '',
    conversationId: '',
    role,
    content,
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso(),
  };
}

export interface ChatSession {
  messages: Message[];
  streaming: boolean;
  send: (content: string) => void;
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
  const lastUserContentRef = React.useRef<string>('');

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

  const send = React.useCallback(
    (content: string) => {
      lastUserContentRef.current = content;
      const userMessage = pendingMessage('user', content);
      const assistantMessage: Message = {
        ...pendingMessage('assistant', ''),
        status: 'streaming',
      };
      setLive((prev) => [...(prev ?? historyQuery.data ?? []), userMessage, assistantMessage]);

      const handlers = {
        onMeta: (data: SsePayloadMap['meta']) => {
          patchLastAssistant({ id: data.messageId, conversationId: data.conversationId });
          if (!conversationId) onConversationCreated(data.conversationId);
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
        { assistantId, ...(conversationId ? { conversationId } : {}), content },
        handlers,
      );
    },
    [assistantId, conversationId, historyQuery.data, onConversationCreated, queryClient, streamSend],
  );

  const retry = React.useCallback(() => {
    if (lastUserContentRef.current) send(lastUserContentRef.current);
  }, [send]);

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
          break;
        }
      }
      return next;
    });
  }, [streamStop]);

  return { messages: baseMessages, streaming, send, retry, stop, reset };
}
