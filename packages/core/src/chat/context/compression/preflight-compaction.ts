import {
  CONTEXT_BUDGET_SAFETY_RATIO,
  CONTEXT_PREFLIGHT_TRIGGER_RATIO,
  HISTORY_MESSAGE_SAFETY_CAP,
} from '@wbfm/shared/constants';
import type { Assistant, Conversation } from '@wbfm/shared/types';
import type { TurnIntent } from '@wbfm/shared/schemas';
import type { TraceHandle } from '@wbfm/ai';
import type { ServiceDeps } from '../../../services/base/deps';
import type { AttachmentService } from '../../../services/assistant/attachment-service';
import type { ConversationService } from '../../../services/assistant/conversation-service';
import type { ResolvedChatTarget } from '../model-resolver';
import { resolveEffectiveContextWindow } from '../window/effective-window';
import { estimateTokens } from '../context-budget';
import { resolvePreflightTrigger } from './preflight-trigger';
import { runPostTurnCompaction } from '../turn-context';

export interface PreflightCompactionParams {
  deps: ServiceDeps;
  conversations: ConversationService;
  attachments: Pick<AttachmentService, 'loadImages'>;
  assistant: Assistant;
  target: ResolvedChatTarget;
  conversation: Conversation;
  conversationId: string;
  intent: TurnIntent;
  /** 设置开关（contextPreflightCompactEnabled） */
  enabled: boolean;
  signal?: AbortSignal;
  traceParent: TraceHandle | null;
}

export interface PreflightCompactionResult {
  conversation: Conversation;
  /** 压缩后重新估算的未折叠历史 token */
  historyEstimate: number;
}

/**
 * v4.8：预判压缩——历史超 85% 水位先折叠，避免本轮撞墙后只能硬截断。
 * v4.8.1：拆出装配主流程守行数门禁；冷开场/闲聊不触发。
 */
export async function maybePreflightCompact(
  params: PreflightCompactionParams,
): Promise<PreflightCompactionResult> {
  const { deps, conversations, attachments, assistant, target, conversationId, intent } = params;
  const estimate = (summaryTurns: number): number =>
    conversations
      .recentMessagesAfter(conversationId, summaryTurns, HISTORY_MESSAGE_SAFETY_CAP)
      .reduce((sum, message) => sum + estimateTokens(message.content), 0);

  let active = params.conversation;
  let historyEstimate = estimate(active.summaryTurns);
  const effectiveWindow = resolveEffectiveContextWindow(target.model).effective;
  const usableWindow = Math.floor(effectiveWindow * CONTEXT_BUDGET_SAFETY_RATIO);
  if (
    params.enabled &&
    intent.kind !== 'chitchat' &&
    historyEstimate > usableWindow * CONTEXT_PREFLIGHT_TRIGGER_RATIO
  ) {
    await runPostTurnCompaction({
      conversations,
      attachments,
      conversation: active,
      assistant,
      target,
      toolDefs: [],
      lastCompletionTokens:
        conversations.lastAssistantUsage(conversationId)?.completionTokens ?? null,
      signal: params.signal,
      traceParent: params.traceParent,
      events: deps.events,
      trigger: resolvePreflightTrigger(
        deps.events,
        conversationId,
        effectiveWindow,
      ),
    });
    active = conversations.get(conversationId);
    historyEstimate = estimate(active.summaryTurns);
  }
  return { conversation: active, historyEstimate };
}
