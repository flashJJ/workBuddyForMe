import type {
  FlowEventPayload,
  FlowGraph,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  FlowTrigger,
  PermissionLevel,
  ProviderModel,
} from '@wbfm/shared';
import type { ChatProvider } from '@wbfm/ai';
import type { RetrievedChunk } from '../retrieval/retrieval-service';
import type { Tool, ToolResult } from '../tools/types';

/**
 * v0.8 Flow Studio 执行内核类型。
 * 编译器产出 CompiledFlow（无环图的拓扑计划），引擎按计划顺序执行并产出 SSE 事件。
 */

/** 下游引用：condition 节点带 true/false 分支句柄；edgeId 供分支剪枝 */
export interface SuccessorRef {
  node: string;
  edgeId: string;
  handle?: 'true' | 'false';
}

export interface CompiledFlow {
  graph: FlowGraph;
  nodesById: Map<string, FlowNode>;
  edgesById: Map<string, FlowEdge>;
  /** Kahn 拓扑序（M1 顺序执行；同层并发为 v0.9） */
  order: string[];
  startNodeId: string;
  endNodeIds: string[];
  predecessors: Map<string, string[]>;
  successors: Map<string, SuccessorRef[]>;
}

/** 运行期节点输出作用域：nodeId → 该节点作用域（普通节点 {outputs}，start 另挂 params） */
export type FlowScope = Map<string, Record<string, unknown>>;

/** 引擎内部节点终态（节点失败即终止整个运行） */
export type FlowNodeState = 'succeeded' | 'skipped' | 'failed';

/** 人工节点等待结果 */
export interface FlowHumanDecision {
  approved: boolean;
  values: Record<string, unknown>;
}

export interface FlowToolConfirmationRequest {
  nodeId: string;
  toolName: string;
  permission: PermissionLevel;
  argsSummary: string;
}

/** 模型解析结果（与 chat/model-resolver 的 ResolvedChatTarget 同构，避免节点依赖 Assistant） */
export interface FlowChatTarget {
  provider: ChatProvider;
  model: ProviderModel;
}

/**
 * 节点处理器运行上下文（由 run-service 按运行注入；引擎测试可只给最小子集）。
 * 回调缺失时，依赖它的节点失败并给出明确错误。
 */
export interface FlowExecutionContext {
  signal?: AbortSignal;
  /** start 节点声明的流程入参（运行时实际值） */
  input: Record<string, unknown>;
  scope: FlowScope;
  /** 触发方式（人工节点/危险工具门控据此区分有人/无人值守） */
  trigger: FlowTrigger;
  /** 是否具备交互式等待能力（试运行 SSE=true；对话触发 M1 自动拒绝等待类节点） */
  interactive: boolean;

  // ── M1 能力回调（均可选；处理器内按需调用） ──
  resolveChatTarget?(
    config: { modelId?: string | null },
  ): Promise<FlowChatTarget> | FlowChatTarget;
  retrieve?(query: string, knowledgeBaseId: string, topK: number): Promise<RetrievedChunk[]>;
  resolveTool?(name: string): Promise<Tool | null> | Tool | null;
  executeTool?(tool: Tool, args: unknown): Promise<ToolResult>;
  /**
   * 工具节点当前已解析并通过门控的工具（仅引擎执行 tool 节点时注入）。
   * 工具处理器据此调用，避免二次解析。
   */
  activeTool?: Tool;
  /** 同步/快速检查是否已有授权记忆（all / 本运行级 grant） */
  checkToolAllowed?(toolName: string, permission: PermissionLevel): boolean | Promise<boolean>;
  /** 交互式工具授权（挂起等待；非交互环境直接返回 false） */
  requestToolConfirmation?(req: FlowToolConfirmationRequest): Promise<boolean>;
  /** 人工节点挂起等待（非交互环境返回 approved:false） */
  requestHuman?(nodeId: string, config: Record<string, unknown>): Promise<FlowHumanDecision>;
}

export interface FlowNodeHandler<
  C = Record<string, unknown>,
  O = unknown,
> {
  type: FlowNodeType;
  run(config: C, ctx: FlowExecutionContext): Promise<O>;
}

/** 注册表以宽类型存储（具体处理器的 config/输出在取用处收窄） */
export type FlowHandlerRegistry = Partial<
  Record<FlowNodeType, FlowNodeHandler<Record<string, unknown>, unknown>>
>;

export interface RunFlowOptions {
  workflowId: string;
  version: number;
  /** 落库后的运行 id（纯内存执行可省略，事件中 runId 为空串） */
  runId?: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  /** 交互式等待（人工/工具授权）；默认 true */
  interactive?: boolean;
  /** 覆盖/追加处理器（测试注入假节点用） */
  handlers?: FlowHandlerRegistry;
  /** 执行上下文（M1 起由 run-service 提供完整能力回调） */
  context?: Partial<Omit<FlowExecutionContext, 'input' | 'scope' | 'trigger' | 'interactive'>>;
  signal?: AbortSignal;
}

/** 引擎事件就是共享契约的 flow SSE 载荷 */
export type { FlowEventPayload };
