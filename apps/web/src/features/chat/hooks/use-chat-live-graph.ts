'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { runGraphLiveBus } from '@/features/run-graph';

/**
 * v2.20 M3：把对话流帧旁路到 RunGraph 总线。
 * 只发布图需要的帧；delta/citations 等不建节点。
 */
export function useChatLiveGraph(conversationId: string | null) {
  const context = React.useRef<{ conversationId: string | null; messageId: string | null }>({
    conversationId,
    messageId: null,
  });

  React.useEffect(() => {
    // 新会话由 meta 先写入 context，随后父级才回填 conversationId；同 id 不重置 messageId
    if (context.current.conversationId === conversationId) return;
    context.current = { conversationId, messageId: null };
  }, [conversationId]);

  const publish = React.useCallback((type: string, payload: unknown) => {
    const rootId = context.current.conversationId;
    if (!rootId) return;
    runGraphLiveBus.publish({
      rootKind: 'conversation',
      rootId,
      scope: 'chat',
      scopeId: rootId,
      type,
      payload,
    });
  }, []);

  const start = React.useCallback(
    (data: SsePayloadMap['meta']) => {
      context.current = { conversationId: data.conversationId, messageId: data.messageId };
      publish('message_started', {
        messageId: data.messageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
      });
    },
    [publish],
  );

  const tool = React.useCallback(
    (data: SsePayloadMap['tool']) => {
      if (data.phase === 'substep') return;
      const messageId = context.current.messageId;
      const startedAt = new Date().toISOString();
      const entry =
        data.phase === 'start'
          ? {
              callId: data.callId,
              tool: data.tool,
              argsSummary: data.argsSummary,
              status: 'running',
              durationMs: 0,
              resultSummary: '',
              startedAt,
            }
          : {
              callId: data.callId,
              tool: data.tool,
              status: data.status,
              durationMs: data.durationMs,
              resultSummary: data.resultSummary,
              startedAt,
              ...(data.error ? { error: data.error } : {}),
              ...(data.artifacts?.length ? { artifacts: data.artifacts } : {}),
            };
      publish('tool_trace', { ...(messageId ? { messageId } : {}), trace: [entry] });
    },
    [publish],
  );

  const complete = React.useCallback(
    (data: SsePayloadMap['done']) => {
      publish('message_completed', {
        messageId: context.current.messageId,
        content: data.content,
        usage: data.usage,
      });
    },
    [publish],
  );

  const fail = React.useCallback(
    (data: SsePayloadMap['error']) => {
      publish('message_error', {
        messageId: context.current.messageId,
        code: data.code,
        message: data.message,
      });
    },
    [publish],
  );

  const stop = React.useCallback(() => {
    publish('message_stopped', { messageId: context.current.messageId });
  }, [publish]);

  return { start, tool, complete, fail, stop };
}
