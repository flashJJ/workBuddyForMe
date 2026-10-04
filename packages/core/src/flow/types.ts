import type {
  FlowEventPayload,
  FlowGraph,
  FlowNode,
  FlowNodeType,
  FlowTrigger,
} from '@wbfm/shared';

/**
 * v0.8 Flow Studio 执行内核类型（M0）。
 * 编译器产出 CompiledFlow（无环图的拓扑计划），引擎按计划顺序执行并产出 SSE 事件。
 */

/** 下游引用：condition 节点带 true/false 分支句柄 */
export interface SuccessorRef {
  node: string;
  handle?: 'true' | 'false';
}

export interface CompiledFlow {
  graph: FlowGraph;
  nodesById: Map<string, FlowNode>;
  /** Kahn 拓扑序（M0 顺序执行；同层并发为 v0.9） */
  order: string[];
  startNodeId: string;
  endNodeIds: string[];
  predecessors: Map<string, string[]>;
  successors: Map<string, SuccessorRef[]>;
}

/** 运行期节点输出作用域：nodeId → 该节点 outputs */
export type FlowScope = Map<string, Record<string, unknown>>;

/** 节点处理器运行上下文（M1 起由容器注入 provider/retrieve/门控） */
export interface FlowExecutionContext {
  signal?: AbortSignal;
  /** start 节点声明的流程入参（运行时实际值） */
  input: Record<string, unknown>;
  scope: FlowScope;
  /** 触发方式（人工节点/危险工具门控据此区分有人/无人值守） */
  trigger: FlowTrigger;
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
  /** 落库后的运行 id（M0 纯内存执行可省略，事件中 runId 为空串） */
  runId?: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  /** 覆盖/追加处理器（测试注入假节点用） */
  handlers?: FlowHandlerRegistry;
  signal?: AbortSignal;
}

/** 引擎事件就是共享契约的 flow SSE 载荷 */
export type { FlowEventPayload };
