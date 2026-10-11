'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import type { AgentRunView } from '@wbfm/shared/schemas';
import { useConversationMutations } from '@/lib/hooks/use-conversations';
import { API } from '@/lib/api/endpoints';
import { apiGet, apiPost } from '@/lib/api/client';
import {
  initAgentCard,
  mergeRunView,
  reduceAgentFrame,
  useAgentRunStream,
  type AgentCardEntry,
  type AgentCardState,
  type AgentRunDetail,
} from '../agent-collab';
import type { PendingToolConfirmation } from './chat-session.types';

/**
 * v1.4 任务模式单轮协作（从 use-chat-session 外迁控行数）：
 * 建会话（如需）→ POST /api/agent/runs → 订阅协作 SSE → 终态权威对账，
 * 泳道卡按助手消息 id 挂在 live 消息流上（live only）。
 */
export interface AgentTaskTurnParams {
  assistantId: string;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  /** 推入用户消息+占位助手消息，返回助手消息 id */
  pushTurn: (content: string) => string;
  patchAssistant: (patch: Partial<Message>) => void;
  /** 协作 Executor 工具门控帧（HITL 弹窗由会话页统一渲染） */
  onGateConfirm: (pending: PendingToolConfirmation) => void;
  /** 终态落账后刷新会话/消息查询 */
  onSettled: () => void;
}

const TERMINAL_STATUS: Message['status'] = 'completed';

export function useAgentTaskTurn(params: AgentTaskTurnParams) {
  const conversationMutations = useConversationMutations();
  const agentStream = useAgentRunStream();
  const [agentCards, setAgentCards] = React.useState<Record<string, AgentCardEntry>>({});
  const [streaming, setStreaming] = React.useState(false);

  const patchCard = React.useCallback(
    (messageId: string, fn: (state: AgentCardState) => AgentCardState) => {
      setAgentCards((prev) => {
        const entry = prev[messageId];
        return entry ? { ...prev, [messageId]: { ...entry, state: fn(entry.state) } } : prev;
      });
    },
    [],
  );

  const start = React.useCallback(
    async (content: string) => {
      const messageId = params.pushTurn(content);
      try {
        let convId = params.conversationId;
        if (!convId) {
          const conv = await conversationMutations.create.mutateAsync({
            assistantId: params.assistantId,
          });
          convId = conv.id;
          params.onConversationCreated(conv.id);
        }
        const run = await apiPost<AgentRunView>(API.agentRuns, {
          assistantId: params.assistantId,
          conversationId: convId,
          goal: content,
        });
        setAgentCards((prev) => ({
          ...prev,
          [messageId]: { runId: run.id, state: initAgentCard(run.budget) },
        }));
        await agentStream.start(run.id, {
          onStreamingChange: setStreaming,
          onFrame: (frame) => {
            if (frame.event === 'agent_tool_confirm') {
              params.onGateConfirm({
                callId: frame.data.callId,
                tool: frame.data.tool,
                permission: frame.data.permission,
                argsSummary: frame.data.argsSummary,
                taskScope: frame.data.taskScope,
              });
            }
            patchCard(messageId, (state) => reduceAgentFrame(state, frame));
          },
        });
        // 终态权威对账（SSE done 不含终态枚举；status/outcome/error 以 GET 为准）
        const detail = await apiGet<AgentRunDetail>(API.agentRun(run.id));
        patchCard(messageId, (state) => mergeRunView(state, detail.run));
        const outcome = detail.run.finalOutcome;
        const finalStatus: Message['status'] =
          detail.run.status === 'done' || detail.run.status === 'budget_exceeded'
            ? TERMINAL_STATUS
            : detail.run.status === 'cancelled'
              ? 'stopped'
              : 'error';
        params.patchAssistant({
          status: finalStatus,
          content: outcome?.summary ?? '',
          citations: outcome?.evidence ?? [],
          ...(detail.run.errorMessage
            ? { errorCode: detail.run.errorCode, errorMessage: detail.run.errorMessage }
            : {}),
        });
        params.onSettled();
      } catch (error) {
        params.patchAssistant({
          status: 'error',
          errorCode: 'AGENT_START_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, conversationMutations, agentStream, patchCard],
  );

  const stop = React.useCallback(() => agentStream.stop(), [agentStream]);

  /** 授权决策提交成功后清掉卡片内的待授权标记 */
  const clearGate = React.useCallback((callId: string) => {
    setAgentCards((prev) => {
      let changed = false;
      const next: Record<string, AgentCardEntry> = {};
      for (const [id, entry] of Object.entries(prev)) {
        if (entry.state.pendingConfirm?.callId === callId) {
          changed = true;
          next[id] = { ...entry, state: { ...entry.state, pendingConfirm: null } };
        } else {
          next[id] = entry;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const reset = React.useCallback(() => {
    agentStream.stop();
    setAgentCards({});
  }, [agentStream]);

  return { agentCards, streaming, start, stop, clearGate, reset };
}
