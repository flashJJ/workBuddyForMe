'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { API } from '@/lib/api/endpoints';
import { ApiClientError, apiPost, withManagedHeaders } from '@/lib/api/client';
import { SseReader } from '@/lib/api/sse-reader';
import type { RawSseEvent } from '@/lib/api/sse-reader';
import type { AgentStreamFrame } from './agent-run-reducer';
import { translateSystemKey, translateSystemText } from '@/lib/i18n/system-text-runtime';

/** v1.4 协作 SSE：POST 建行后订阅 /api/agent/runs/:id/events，支持客户端主动中断（联动服务端 abort） */

export interface AgentRunStreamHandlers {
  onFrame?: (frame: AgentStreamFrame) => void;
  onStreamingChange?: (streaming: boolean) => void;
}

const AGENT_EVENT_NAMES = new Set([
  'agent_phase',
  'agent_handoff',
  'agent_review',
  'agent_budget',
  'agent_tool_confirm',
  'done',
  'error',
]);

function narrow(raw: RawSseEvent): AgentStreamFrame | null {
  return AGENT_EVENT_NAMES.has(raw.event) ? (raw as unknown as AgentStreamFrame) : null;
}

export function useAgentRunStream() {
  const controllerRef = React.useRef<AbortController | null>(null);
  const runIdRef = React.useRef<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
    // 显式急停：不能只靠 SSE 断线联动——生产模式下点击可能早于事件流建连，
    // 断线信号永远到不了服务端。cancel 对活跃/未订阅两种 running 都能收敛。
    const runId = runIdRef.current;
    if (runId) {
      void apiPost(API.agentRunCancel(runId), {}).catch(() => {
        /* 404/409/网络错误均不阻塞 UI 收尾 */
      });
    }
  }, []);

  const start = React.useCallback(
    async (runId: string, handlers: AgentRunStreamHandlers): Promise<void> => {
      controllerRef.current?.abort();
      runIdRef.current = runId;
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreaming(true);
      handlers.onStreamingChange?.(true);

      const finish = () => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          runIdRef.current = null;
        }
        setStreaming(false);
        handlers.onStreamingChange?.(false);
      };

      try {
        const response = await fetch(
          API.agentRunEvents(runId),
          withManagedHeaders({ signal: controller.signal }),
        );
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: SsePayloadMap['error'] }
            | null;
          handlers.onFrame?.({
            event: 'error',
            data: payload?.error
              ? { ...payload.error, message: translateSystemText(payload.error.message) || payload.error.message }
              : { code: 'INTERNAL_ERROR', message: translateSystemKey('agents.errors.streamConnectFailed') },
          });
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
            const frame = narrow(raw);
            if (frame) handlers.onFrame?.(frame);
          }
        }
      } catch (error) {
        // 主动 abort：服务端以 done(cancelled) 收尾，仅对真正的网络错误回调
        if (!controller.signal.aborted) {
          handlers.onFrame?.({
            event: 'error',
            data: error instanceof ApiClientError
              ? { code: error.code, message: translateSystemText(error.message) }
              : { code: 'NETWORK_ERROR', message: translateSystemKey('agents.errors.networkInterrupted') },
          });
        }
      } finally {
        finish();
      }
    },
    [],
  );

  React.useEffect(() => () => controllerRef.current?.abort(), []);

  return { start, stop, streaming };
}
