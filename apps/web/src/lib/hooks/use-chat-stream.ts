'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared';
import { API } from '@/lib/api/endpoints';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { SseReader } from '@/lib/api/sse-reader';

export interface ChatStreamHandlers {
  onMeta?: (data: SsePayloadMap['meta']) => void;
  onDelta?: (data: SsePayloadMap['delta']) => void;
  onCitations?: (data: SsePayloadMap['citations']) => void;
  onTool?: (data: SsePayloadMap['tool']) => void;
  onDone?: (data: SsePayloadMap['done']) => void;
  onError?: (data: SsePayloadMap['error']) => void;
  onStreamingChange?: (streaming: boolean) => void;
}

export interface ChatStreamInput {
  assistantId: string;
  conversationId?: string;
  content: string;
  /** v0.3：本轮图片附件 ID（最多 4 张，需模型具备 vision 能力） */
  attachments?: string[];
  /** 重新生成：沿用上一条用户消息，不需要新内容之外的服务端改动 */
  regenerate?: boolean;
}

/** SSE 对话流：fetch + ReadableStream 增量解析，支持客户端主动中断 */
export function useChatStream() {
  const controllerRef = React.useRef<AbortController | null>(null);
  const [streaming, setStreaming] = React.useState(false);

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const send = React.useCallback(
    async (input: ChatStreamInput, handlers: ChatStreamHandlers): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreaming(true);
      handlers.onStreamingChange?.(true);

      const finish = () => {
        if (controllerRef.current === controller) controllerRef.current = null;
        setStreaming(false);
        handlers.onStreamingChange?.(false);
      };

      try {
        const response = await fetch(
          API.chatStream,
          withManagedHeaders({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
            signal: controller.signal,
          }),
        );

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: SsePayloadMap['error'] }
            | null;
          handlers.onError?.(
            payload?.error ?? { code: 'INTERNAL_ERROR', message: '流式连接失败' },
          );
          finish();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
            switch (event.event) {
              case 'meta':
                handlers.onMeta?.(event.data as SsePayloadMap['meta']);
                break;
              case 'delta':
                handlers.onDelta?.(event.data as SsePayloadMap['delta']);
                break;
              case 'citations':
                handlers.onCitations?.(event.data as SsePayloadMap['citations']);
                break;
              case 'tool':
                handlers.onTool?.(event.data as SsePayloadMap['tool']);
                break;
              case 'done':
                handlers.onDone?.(event.data as SsePayloadMap['done']);
                break;
              case 'error':
                handlers.onError?.(event.data as SsePayloadMap['error']);
                break;
            }
          }
        }
      } catch (error) {
        // 主动 abort 时服务端会以 done(stopped) 收尾；仅对真正的网络错误回调
        if (!controller.signal.aborted) {
          handlers.onError?.(
            error instanceof ApiClientError
              ? { code: error.code, message: error.message }
              : { code: 'NETWORK_ERROR', message: '网络连接中断' },
          );
        }
      } finally {
        finish();
      }
    },
    [],
  );

  React.useEffect(() => () => controllerRef.current?.abort(), []);

  return { send, stop, streaming };
}
