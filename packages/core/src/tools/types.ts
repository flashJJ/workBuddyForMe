import type { Citation, ToolName } from '@wbfm/shared';
import type { ToolDefinition } from '@wbfm/ai';
import type { RetrievedChunk } from '../retrieval/retrieval-service';

/** 工具执行时可使用的能力（由编排器按本轮对话注入） */
export interface ToolContext {
  signal?: AbortSignal;
  /** 当前助手绑定的知识库 id；未绑定时 knowledge_search 直接拒绝 */
  knowledgeBaseId: string | null;
  /** 向量检索回调（复用 RAG 检索内核） */
  retrieve: (
    query: string,
    topK: number,
    signal?: AbortSignal,
  ) => Promise<RetrievedChunk[]>;
}

/** 工具执行结果：output 回灌模型，summary 用于界面展示 */
export interface ToolResult {
  ok: boolean;
  output: string;
  summary: string;
  /** knowledge_search 命中时透传引用角标 */
  citations?: Citation[];
}

/** 内置只读工具统一接口 */
export interface Tool {
  name: ToolName;
  description: string;
  /** OpenAI function-calling 参数 JSON Schema */
  parameters: Record<string, unknown>;
  run(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export type ToolMap = ReadonlyMap<ToolName, Tool>;

/** 工具参数错误：执行器捕获后回灌模型，给一次自我纠正机会 */
export class ToolArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgError';
  }
}

/** 工具映射为下发给模型的函数声明 */
export function toToolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
