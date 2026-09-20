import type { ChatMessage, ChatParams, TokenUsage } from '../../types';

export interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface ChatCompletionRequestBody {
  model: string;
  messages: ChatMessage[];
  stream: true;
  stream_options: { include_usage: boolean };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export function buildChatBody(params: ChatParams): ChatCompletionRequestBody {
  return {
    model: params.model,
    messages: params.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.topP !== undefined ? { top_p: params.topP } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
  };
}

export function mapUsage(usage: NonNullable<ChatCompletionChunk['usage']>): TokenUsage {
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

export const DONE_MARKER = '[DONE]';
