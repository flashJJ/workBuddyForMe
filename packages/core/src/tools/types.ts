import type {
  ArtifactRef,
  ArtifactWriteInput,
  Citation,
  PermissionLevel,
  ToolEvidence,
  ToolSubstep,
} from '@wbfm/shared/types';
import type { WebSearchInput, WebSearchResponse } from '@wbfm/shared/types';
import type { CapabilityKind, WorkStepStatus } from '@wbfm/shared/schemas';
import type { ToolDefinition } from '@wbfm/ai';
import type { RetrievedChunk } from '../retrieval/retrieval-service';
import type {
  CapabilityCatalogInstallResult,
  CapabilityCatalogSearchItem,
  CapabilityInventoryItem,
} from '../capabilities/catalog/types';

/** 工具执行时可使用的能力（由编排器按本轮对话注入） */
export interface ToolContext {
  signal?: AbortSignal;
  /** 当前生效的知识库 id 集合（助手多库绑定 / 协作子任务单库收敛）；空集时 knowledge_search 直接拒绝 */
  knowledgeBaseIds: string[];
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
  /** v2.8：当前会话 id（todo_write 等会话级工具使用） */
  conversationId?: string;
  /** v2.13 M5：任务运行 id（隔离网页会话按运行分区） */
  runId?: string;
  /** v2.13 M5：当前策略域名规则（desktop 在重定向时复核） */
  policyDomains?: { allow: string[]; deny: string[] };
  /** v2.13 M5：工具侧治理事件（浏览器导航被拒等） */
  governanceAudit?: (input: {
    kind: 'policy_denied';
    tool: string;
    reasonCode: string;
    outcome?: string;
  }) => void;
  /** v2.17：联网搜索回调（未配置时 web_search 返回可执行错误） */
  searchWeb?: (input: WebSearchInput, signal?: AbortSignal) => Promise<WebSearchResponse>;
  /** v2.17：当前助手 id（能力安装后回写白名单用） */
  assistantId?: string;
  /** v2.17：能力目录检索（未提供时 capability_search 明确返回不可用） */
  searchCapabilities?: (input: {
    query: string;
    kind?: CapabilityKind;
  }) => CapabilityCatalogSearchItem[];
  /** v2.17：能力安装（权限门已完成 HITL 后才执行） */
  installCapability?: (input: {
    catalogId: string;
    reason?: string;
  }) => CapabilityCatalogInstallResult;
  /** v2.30：已安装能力清单（含目录 effects/toolNames），供 capability_list 与审批详情使用 */
  listCapabilities?: () => CapabilityInventoryItem[];
  /** v2.17：安装后把只读工具追加到当前助手白名单；非只读工具跳过 */
  bindTools?: (toolNames: string[]) => { added: string[]; skipped: string[] };
  /** v2.18：写入产物文件（未提供时 artifact_write 返回不可用） */
  writeArtifact?: (input: ArtifactWriteInput) => ArtifactRef;
  /** v2.8：写入会话待办清单（未提供时 todo_write 直接拒绝） */
  writeTodos?: (todos: Array<{ title: string; status?: WorkStepStatus }>) => {
    planId: string;
    done: number;
    total: number;
  };
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
  /** v2.18：本次调用产出的文件（对话产物卡片展示） */
  artifacts?: ArtifactRef[];
  /** v2.18 M5：出处/覆盖/未覆盖（只展示，不入模） */
  evidence?: ToolEvidence;
  /**
   * v2.27：本轮已对同一目标连续失败达到上限，工具侧已改为降级（不再重试）。
   * 目前仅 fetch_webpage 的网络/超时/过大类失败使用。
   */
  degraded?: boolean;
}

/** 工具统一接口（v0.6：内置与 MCP 工具同构；name 为全局限定名） */
export interface Tool {
  name: string;
  description: string;
  /** OpenAI function-calling 参数 JSON Schema */
  parameters: Record<string, unknown>;
  /** v0.6 M2：权限分级（read/write/danger）；未标注默认 read */
  permission?: PermissionLevel;
  /** v2.17：即使策略/模式允许也必须 HITL（能力安装等不可静默操作） */
  alwaysConfirm?: boolean;
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
