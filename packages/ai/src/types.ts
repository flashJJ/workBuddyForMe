import type { MessageRole, ProviderProtocol } from '@wbfm/shared';

/** 供应商连接配置（apiKey 已由 core 解密到内存） */
export interface ProviderConnection {
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string | null;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatChunk {
  delta: string;
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
  /** 轻量探活（如拉取模型列表），失败抛 ProviderError */
  testConnection(signal?: AbortSignal): Promise<void>;
  listModels(signal?: AbortSignal): Promise<string[]>;
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  embed(params: EmbedParams): Promise<EmbedResult>;
}
