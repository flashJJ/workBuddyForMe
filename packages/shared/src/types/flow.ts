/**
 * v0.8 Flow Studio 可视化工作流契约（视图模型 + SSE 事件）。
 * 图结构的 zod 校验契约见 schemas/flow.ts。
 */

export const FLOW_STATUSES = ['draft', 'published', 'disabled'] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export const FLOW_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_human',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type FlowRunStatus = (typeof FLOW_RUN_STATUSES)[number];

/** 终态：不会再发生状态迁移 */
export const FLOW_RUN_TERMINAL_STATUSES: ReadonlyArray<FlowRunStatus> = [
  'succeeded',
  'failed',
  'cancelled',
];

export const FLOW_NODE_EXEC_STATUSES = [
  'running',
  'succeeded',
  'failed',
  'skipped',
  'waiting_human',
] as const;
export type FlowNodeExecStatus = (typeof FLOW_NODE_EXEC_STATUSES)[number];

/** 运行触发方式：v0.8 仅 manual/chat 有人在场；api/mcp/schedule 为 v0.9/v0.10 预留 */
export const FLOW_TRIGGERS = ['manual', 'chat', 'api', 'mcp', 'schedule'] as const;
export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

/** 工作流视图（列表/详情） */
export interface WorkflowView {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: FlowStatus;
  /** 当前版本号（0=尚无保存的图） */
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  /** 详情接口附带：最近一次成功运行时间（列表卡片用，无运行记录为 null） */
  lastRunAt?: string | null;
}

/** 工作流版本视图（图快照） */
export interface WorkflowVersionView {
  id: string;
  workflowId: string;
  version: number;
  /** FlowGraph 已反序列化 */
  graph: import('../schemas/flow').FlowGraph;
  publishedAt: string | null;
  createdAt: string;
}

/** 一次工作流运行 */
export interface WorkflowRunView {
  id: string;
  workflowId: string;
  /** 运行时固定的版本号（发布后改草稿不影响在途运行） */
  version: number;
  trigger: FlowTrigger;
  status: FlowRunStatus;
  /** start 节点入参（反序列化） */
  input: Record<string, unknown> | null;
  /** end 节点最终输出（反序列化） */
  output: unknown;
  error: { code: string; message: string; nodeId?: string } | null;
  /** chat 触发时关联的会话，其余触发为 null */
  conversationId: string | null;
  /** 当前挂起的人工节点 id（waiting_human 时非空） */
  waitNodeId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** 单个节点的执行记录（试运行时间线数据源） */
export interface NodeExecutionView {
  id: string;
  runId: string;
  nodeId: string;
  status: FlowNodeExecStatus;
  /** 引用解析后的实际入参（反序列化） */
  inputs: unknown;
  /** 节点输出（反序列化） */
  outputs: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
}

/** 图校验诊断（API/引擎共用，UI 凭 nodeId/edgeId 定位） */
export const FLOW_DIAGNOSTIC_SEVERITIES = ['error', 'warning'] as const;
export type FlowDiagnosticSeverity = (typeof FLOW_DIAGNOSTIC_SEVERITIES)[number];

export interface FlowDiagnostic {
  severity: FlowDiagnosticSeverity;
  /** 稳定错误码（如 flow/cycle、flow/duplicate-node），便于前端做引导文案 */
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

// ── SSE 运行事件（GET /api/flows/runs/[id]/events） ──

export const FLOW_EVENT_TYPES = [
  'run_started',
  'node_started',
  'node_succeeded',
  'node_skipped',
  'node_waiting_human',
  'node_failed',
  'run_succeeded',
  'run_failed',
  'run_cancelled',
] as const;
export type FlowEventType = (typeof FLOW_EVENT_TYPES)[number];

interface FlowRunEventBase {
  runId: string;
  workflowId: string;
}

/** SSE flow 事件载荷（判别联合；节点事件必带 nodeId） */
export type FlowEventPayload =
  | (FlowRunEventBase & { type: 'run_started'; version: number; trigger: FlowTrigger })
  | (FlowRunEventBase & {
      type: 'node_started';
      nodeId: string;
      nodeType: string;
      /** 引用解析后的实际入参（试运行面板/落库用，M1 起携带） */
      inputs?: unknown;
    })
  | (FlowRunEventBase & {
      type: 'node_succeeded';
      nodeId: string;
      /** 输出摘要/完整结果（试运行面板用；大对象由 API 层决定是否裁剪） */
      outputs?: unknown;
      durationMs?: number;
    })
  | (FlowRunEventBase & { type: 'node_skipped'; nodeId: string; reason: string })
  | (FlowRunEventBase & { type: 'node_waiting_human'; nodeId: string })
  | (FlowRunEventBase & { type: 'node_failed'; nodeId: string; message: string })
  | (FlowRunEventBase & { type: 'run_succeeded'; output: unknown })
  | (FlowRunEventBase & { type: 'run_failed'; message: string; nodeId?: string })
  | (FlowRunEventBase & { type: 'run_cancelled' });
