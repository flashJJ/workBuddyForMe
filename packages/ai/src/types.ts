import type { MessageRole, ProviderProtocol } from '@wbfm/shared';

/** 供应商连接配置（apiKey 已由 core 解密到内存） */
export interface ProviderConnection {
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string | null;
}

/** 模型发起的一次函数调用（arguments 为上游下发的 JSON 字符串） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** v0.3：视觉对话 content parts（OpenAI vision wire 形态，url 为 data URL） */
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImageUrlPart {
  type: 'image_url';
  image_url: {
    /** data:image/...;base64,... 或可公开访问的图片 URL */
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ChatContentPart = TextPart | ImageUrlPart;

/**
 * 对话消息。
 * content 可空：assistant 请求工具调用时只有 toolCalls；
 * content 可为片段数组：v0.3 多模态用户消息（text + image_url）；
 * role:'tool' 时通过 toolCallId/name 关联对应的调用结果。
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | ChatContentPart[] | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 下发给模型的工具声明（OpenAI function-calling 线格式） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** 缺省/空数组 = 纯对话，不允许调用工具 */
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

/** 工具调用增量在适配器内按 index 拼装完成后整体产出 */
export interface ChatChunk {
  delta: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length' | string;
  usage?: TokenUsage;
}

export interface EmbedParams {
  model: string;
  input: string[];
  signal?: AbortSignal;
}

export interface EmbedResult {
  vectors: number[][];
  dimension: number;
}

/** 模型供应商统一适配器接口 */
export interface ChatProvider {
  /** 是否支持函数调用；不支持时编排器不下发 tools，自动降级纯对话 */
  readonly supportsTools: boolean;
  /** 轻量探活（如拉取模型列表），失败抛 ProviderError */
  testConnection(signal?: AbortSignal): Promise<void>;
  listModels(signal?: AbortSignal): Promise<string[]>;
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  embed(params: EmbedParams): Promise<EmbedResult>;
}
