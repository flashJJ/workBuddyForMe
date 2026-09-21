import type { TokenUsage } from '@wbfm/shared';
import { startRun, type ChatMessage, type TraceHandle, type ToolCall, type ToolDefinition } from '@wbfm/ai';
import type { Assistant } from '@wbfm/shared';
import type { ResolvedChatTarget } from './model-resolver';
import type { OrchestratorEvent } from './types';

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
