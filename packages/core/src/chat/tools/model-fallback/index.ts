import {
  MAX_MODEL_SWITCH_ATTEMPTS,
  canAutoSwitchModel,
  type ModelSwitchEvent,
} from '@wbfm/shared/errors';
import { classifyModelFailure, type ChatMessage, type ToolDefinition, type TraceHandle } from '@wbfm/ai';
import type { SsePayloadMap } from '@wbfm/shared/api';
import type { Assistant } from '@wbfm/shared/types';
import type { OrchestratorEvent } from '../../base/types';
import type { ResolvedChatTarget } from '../../context/model-resolver';
import { runProviderTurnWithToolFallback, type ProviderTurn } from '../tool-runner';

/**
 * v4.18 A 线：模型轮次级备用模型路由。
 *
 * - 只在「首字前」自动切换：已产出任何非空 delta 即视为首字后；
 * - 只对可自动切换错误生效（限流/超时/5xx/首字前断流）；
 * - 单轮最多 MAX_MODEL_SWITCH_ATTEMPTS 次，且不会切换到当前模型自身；
 * - 切换本身通过 onSwitch 交给编排器写事件，正文不进入事件。
 */
export interface ModelFallbackTurnParams {
  target: ResolvedChatTarget;
  /** v4.19：按顺序尝试的备用模型候选（最多 5 个；已尝试的不重复） */
  fallbacks?: ResolvedChatTarget[];
  assistant: Assistant;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
  /** 进入本轮前是否已有正文（工具轮之间为空；跨轮累计由调用方传入） */
  hasOutput: boolean;
  onSwitch?: (event: ModelSwitchEvent) => void;
  /** 可选的 SSE 可见提示（由编排器补会话/消息 id 与展示名） */
  buildSwitchNotice?: (
    event: ModelSwitchEvent,
    from: ResolvedChatTarget,
    to: ResolvedChatTarget,
  ) => SsePayloadMap['model_switched'];
}

export interface ModelFallbackTurnResult extends ProviderTurn {
  /** 实际完成本轮的模型（发生切换时为备用模型） */
  target: ResolvedChatTarget;
  switches: ModelSwitchEvent[];
}

/** v4.18：SSE 可见提示（补会话/消息 id 与展示名，不含正文） */
export function buildModelSwitchNotice(input: {
  event: ModelSwitchEvent;
  from: ResolvedChatTarget;
  to: ResolvedChatTarget;
  conversationId: string;
  messageId: string;
}): SsePayloadMap['model_switched'] {
  return {
    conversationId: input.conversationId,
    messageId: input.messageId,
    fromModelId: input.event.fromModelId,
    toModelId: input.event.toModelId,
    fromModelName: input.from.model.displayName,
    toModelName: input.to.model.displayName,
    reason: input.event.reason,
    attempt: input.event.attempt,
  };
}

export async function* runProviderTurnWithModelFallback(  params: ModelFallbackTurnParams,
): AsyncGenerator<OrchestratorEvent, ModelFallbackTurnResult> {
  let active = params.target;
  const switches: ModelSwitchEvent[] = [];
  const attempted = new Set<string>([active.model.id]);
  let emitted = params.hasOutput;

  for (;;) {
    try {
      const turn = runProviderTurnWithToolFallback({
        target: active,
        assistant: params.assistant,
        messages: params.messages,
        tools: params.tools,
        signal: params.signal,
        traceParent: params.traceParent ?? null,
      });
      let outcome: ProviderTurn | null = null;
      while (true) {
        const step = await turn.next();
        if (step.done) {
          outcome = step.value;
          break;
        }
        if (step.value.event === 'delta') {
          const content = (step.value.data as { content?: unknown }).content;
          if (typeof content === 'string' && content.length > 0) emitted = true;
        }
        yield step.value;
      }
      if (!outcome) throw new Error('模型轮次未返回结果');
      return { ...outcome, target: active, switches };
    } catch (error) {
      if (params.signal?.aborted) throw error;
      const failure = classifyModelFailure(
        error,
        emitted ? 'after_first_token' : 'before_first_token',
      );
      const next = (params.fallbacks ?? []).find((item) => !attempted.has(item.model.id));
      if (
        !failure ||
        !canAutoSwitchModel(failure) ||
        !next ||
        switches.length >= MAX_MODEL_SWITCH_ATTEMPTS
      ) {
        throw error;
      }
      attempted.add(next.model.id);
      const event: ModelSwitchEvent = {
        fromModelId: active.model.id,
        toModelId: next.model.id,
        reason: failure.code,
        attempt: switches.length + 1,
      };
      switches.push(event);
      params.onSwitch?.(event);
      const notice = params.buildSwitchNotice?.(event, active, next);
      if (notice) yield { event: 'model_switched', data: notice };
      active = next;
    }
  }
}
