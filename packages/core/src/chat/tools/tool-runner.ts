import type { TokenUsage } from '@wbfm/shared/api';
import { isContextOverflowError, startRun, type ChatMessage, type TraceHandle, type ToolCall, type ToolDefinition } from '@wbfm/ai';
import type { Assistant } from '@wbfm/shared/types';
import type { ResolvedChatTarget } from '../context/model-resolver';
import type { OrchestratorEvent } from '../base/types';
import { shrinkMessagesForOverflow } from '../context/window/shrink-messages';

export interface ProviderTurn {
  /** 本轮文本产出（工具轮通常为空，最终轮为回答正文） */
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
}

export interface TurnParams {
  target: ResolvedChatTarget;
  assistant: Assistant;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
  /** LangSmith 父 span（chat-turn），未启用追踪时为 null */
  traceParent?: TraceHandle | null;
}

/**
 * 执行一次模型流式调用，把文本增量转发为 delta 事件；
 * 工具调用增量已在适配器层拼装，这里随 generator 返回值汇总。
 */
export async function* runProviderTurn(
  params: TurnParams,
): AsyncGenerator<OrchestratorEvent, ProviderTurn> {
  let content = '';
  let usage: TokenUsage | null = null;
  let toolCalls: ToolCall[] = [];

  const llmRun = await startRun({
    name: `chat:${params.target.model.modelId}`,
    runType: 'llm',
    inputs: {
      messages: params.messages,
      tools: params.tools.map((tool) => tool.function.name),
    },
    metadata: {
      ls_model_name: params.target.model.modelId,
      modelId: params.target.model.id,
      providerId: params.target.model.providerId,
      temperature: params.assistant.temperature,
    },
    parent: params.traceParent ?? null,
  });

  try {
    const stream = params.target.provider.chatStream({
      model: params.target.model.modelId,
      messages: params.messages,
      temperature: params.assistant.temperature,
      topP: params.assistant.topP,
      maxTokens: params.assistant.maxTokens ?? undefined,
      ...(params.tools.length > 0 ? { tools: params.tools } : {}),
      signal: params.signal,
    });

    for await (const chunk of stream) {
      if (chunk.delta) {
        content += chunk.delta;
        yield { event: 'delta', data: { content: chunk.delta } };
      }
      if (chunk.usage) usage = chunk.usage;
      if (chunk.toolCalls && chunk.toolCalls.length > 0) toolCalls = chunk.toolCalls;
    }
  } catch (error) {
    await llmRun?.end(undefined, error);
    throw error;
  }

  await llmRun?.end({
    content,
    toolCalls: toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
    usage,
  });
  return { content, toolCalls, usage };
}

/** 识别「模型不支持工具调用」类上游错误（Ollama/LM Studio 等返回 400） */
export function isToolsUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not support tools|tools?\s+is not supported|unsupported tools?/i.test(message);
}

/**
 * 带降级的模型轮次：
 * 1. 上下文超限（窗口估值偏大/历史过长）：按 user 边界缩一半重试一次；
 * 2. 端点声明支持工具但具体模型拒绝工具：去掉工具声明重试一次。
 * 两者都发生在流打开前，不会重复产出正文。
 */
export async function* runProviderTurnWithToolFallback(
  params: TurnParams,
): AsyncGenerator<OrchestratorEvent, ProviderTurn> {
  try {
    return yield* runProviderTurn(params);
  } catch (error) {
    if (isContextOverflowError(error)) {
      const shrunk = shrinkMessagesForOverflow(params.messages);
      if (shrunk) return yield* runProviderTurn({ ...params, messages: shrunk });
    }
    if (params.tools.length === 0 || !isToolsUnsupportedError(error)) throw error;
    return yield* runProviderTurn({ ...params, tools: [] });
  }
}
