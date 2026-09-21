import type { ChatMessage, ChatParams, TokenUsage, ToolCall, ToolDefinition } from '../../types';

/** 上游 SSE chunk 中工具调用增量（按 index 分片到达） */
export interface IncomingToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: IncomingToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface ChatCompletionRequestBody {
  model: string;
  messages: WireChatMessage[];
  stream: true;
  stream_options: { include_usage: boolean };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
}

/** OpenAI 线上消息格式（snake_case） */
export interface WireChatMessage {
  role: ChatMessage['role'];
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** 内部 ChatMessage（camelCase）→ OpenAI wire（snake_case） */
export function toWireMessage(message: ChatMessage): WireChatMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.name ? { name: message.name } : {}),
  };
}

export function buildChatBody(params: ChatParams): ChatCompletionRequestBody {
  return {
    model: params.model,
    messages: params.messages.map(toWireMessage),
    stream: true,
    stream_options: { include_usage: true },
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.topP !== undefined ? { top_p: params.topP } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
    ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
  };
}

export function mapUsage(usage: NonNullable<ChatCompletionChunk['usage']>): TokenUsage {
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

/**
 * 工具调用增量累加器：上游把 id / 函数名 / 参数 JSON 拆在多个 chunk，
 * 需要按 choices[].delta.tool_calls[].index 归并拼装。
 */
export class ToolCallAccumulator {
  private slots = new Map<number, { id?: string; name?: string; args: string }>();

  absorb(deltas: IncomingToolCallDelta[] | undefined): void {
    for (const delta of deltas ?? []) {
      const slot = this.slots.get(delta.index) ?? { args: '' };
      if (delta.id) slot.id = delta.id;
      if (delta.function?.name) slot.name = delta.function.name;
      if (delta.function?.arguments) slot.args += delta.function.arguments;
      this.slots.set(delta.index, slot);
    }
  }

  /** 按 index 顺序产出完整工具调用；参数缺失时为空串，交由上层 Zod 校验拒绝 */
  assemble(): ToolCall[] {
    return [...this.slots.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, slot]) => ({
        id: slot.id || `call_${index}`,
        type: 'function' as const,
        function: { name: slot.name ?? '', arguments: slot.args },
      }));
  }
}

export const DONE_MARKER = '[DONE]';
