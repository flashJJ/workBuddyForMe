'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { API } from '@/lib/api/endpoints';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { SseReader } from '@/lib/api/sse-reader';
import { assertNever, narrowChatSseEvent } from '@/lib/api/sse-events';

export interface ChatStreamHandlers {
  onMeta?: (data: SsePayloadMap['meta']) => void;
  onDelta?: (data: SsePayloadMap['delta']) => void;
  onCitations?: (data: SsePayloadMap['citations']) => void;
  onMemories?: (data: SsePayloadMap['memories']) => void;
  onTool?: (data: SsePayloadMap['tool']) => void;
  /** v0.6 M2：write/danger 工具执行前需用户授权（HITL 弹窗） */
  onToolConfirmationRequired?: (data: SsePayloadMap['tool_confirmation_required']) => void;
  /** v1.0：语音朗读帧（base64 wav，按序）与语音状态 */
  onVoiceAudio?: (data: SsePayloadMap['voice_audio']) => void;
  onVoiceState?: (data: SsePayloadMap['voice_state']) => void;
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
  /** v1.0：语音选项（tts=true 时服务端额外推 voice_audio 帧） */
  voice?: { tts: boolean };
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
          for (const raw of parser.feed(decoder.decode(value, { stream: true }))) {
            // wire 边界单次窄化：事件名不在对话流白名单（task/flow/未知帧）则忽略
            const event = narrowChatSseEvent(raw);
            if (!event) continue;
            // data 类型由 SsePayloadMap 判别联合推出；switch 必须穷尽（漏分支 tsc 红）
            switch (event.event) {
              case 'meta':
                handlers.onMeta?.(event.data);
                break;
              case 'delta':
                handlers.onDelta?.(event.data);
                break;
              case 'citations':
                handlers.onCitations?.(event.data);
                break;
              case 'memories':
                handlers.onMemories?.(event.data);
                break;
              case 'tool':
                handlers.onTool?.(event.data);
                break;
              case 'tool_confirmation_required':
                handlers.onToolConfirmationRequired?.(event.data);
                break;
              case 'voice_audio':
                handlers.onVoiceAudio?.(event.data);
                break;
              case 'voice_state':
                handlers.onVoiceState?.(event.data);
                break;
              case 'done':
                handlers.onDone?.(event.data);
                break;
              case 'error':
                handlers.onError?.(event.data);
                break;
              default:
                assertNever(event);
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
