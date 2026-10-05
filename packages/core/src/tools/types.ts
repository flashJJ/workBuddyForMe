import type { Citation, PermissionLevel, ToolSubstep } from '@wbfm/shared';
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
  /** v0.7 M1：本轮对话模型是否具备视觉能力（screen_snapshot 据此决定是否携带图片） */
  visionCapable?: boolean;
  /**
   * v0.8：工具内部子步骤进度回调（flow 工具逐节点执行时上报，对话 SSE 实时展示）。
   * 同一子步骤 id 会先 running 后 ok/error/skipped。
   */
  onSubstep?: (substep: ToolSubstep) => void;
}

/** 工具结果携带的图片（如屏幕截图），由编排器落盘为附件并注入视觉消息 */
export interface ToolResultImage {
  mimeType: string;
  dataBase64: string;
}

/** 工具执行结果：output 回灌模型，summary 用于界面展示 */
export interface ToolResult {
  ok: boolean;
  output: string;
  summary: string;
  /** knowledge_search 命中时透传引用角标 */
  citations?: Citation[];
  /** v0.7 M1：图片结果（仅视觉模型轮次产出） */
  images?: ToolResultImage[];
  /** v0.8：工具内部子步骤快照（flow 工具逐节点执行结果，落 tool_trace） */
  substeps?: ToolSubstep[];
}

/** 工具统一接口（v0.6：内置与 MCP 工具同构；name 为全局限定名） */
export interface Tool {
  name: string;
  description: string;
  /** OpenAI function-calling 参数 JSON Schema */
  parameters: Record<string, unknown>;
  /** v0.6 M2：权限分级（read/write/danger）；未标注默认 read */
  permission?: PermissionLevel;
  run(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export type ToolMap = ReadonlyMap<string, Tool>;

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
