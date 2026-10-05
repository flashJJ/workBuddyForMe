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
  /** v0.9：进程重启时在途运行（running/waiting_human）无执行者，收敛为该终态 */
  'interrupted',
] as const;
export type FlowRunStatus = (typeof FLOW_RUN_STATUSES)[number];

/** 终态：不会再发生状态迁移 */
export const FLOW_RUN_TERMINAL_STATUSES: ReadonlyArray<FlowRunStatus> = [
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
];

/** 可重跑的终态（失败/取消/中断；成功运行也可手动再跑但走新建对话或 API） */
export const FLOW_RUN_RESUMABLE_STATUSES: ReadonlyArray<FlowRunStatus> = [
  'failed',
  'cancelled',
  'interrupted',
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
  /** v0.9：API/MCP 触发来源端点 id（manual/chat 为 null） */
  endpointId: string | null;
  /** v0.9：重放运行关联的原始运行 id（整体/节点重跑时非空） */
  parentRunId: string | null;
  /** v0.9：从某节点重放时的起点节点 id（整体重跑为 null） */
  resumedFromNode: string | null;
  /** v0.9：中断原因（当前仅 process_restart） */
  interruptReason: string | null;
}

/* ──────────────────────── v0.9 服务化（端点/策略） ──────────────────────── */

export const FLOW_ENDPOINT_STATUSES = ['enabled', 'disabled'] as const;
export type FlowEndpointStatus = (typeof FLOW_ENDPOINT_STATUSES)[number];

/** 无人值守（API/MCP）触发下 write/danger 工具节点的授权策略 */
export const FLOW_UNATTENDED_POLICY_MODES = ['deny_all', 'allowlist'] as const;
export type FlowUnattendedPolicyMode = (typeof FLOW_UNATTENDED_POLICY_MODES)[number];

export type FlowUnattendedPolicy =
  | { mode: 'deny_all' }
  | { mode: 'allowlist'; allowed: string[] };

/** 工作流对外暴露端点（v1 一流程一端点） */
export interface WorkflowEndpointView {
  id: string;
  workflowId: string;
  /** 密钥可展示短头（明文不落库、不返回） */
  keyPrefix: string;
  httpEnabled: boolean;
  mcpEnabled: boolean;
  /** 同步调用等待上限（毫秒），超时转异步 */
  syncTimeoutMs: number;
  /** 每分钟每密钥调用上限 */
  rateLimitPerMin: number;
  policy: FlowUnattendedPolicy;
  /** 新版本含危险操作节点时，调用前需重新确认策略 */
  policyRevalidationRequired: boolean;
  status: FlowEndpointStatus;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 端点创建/重置密钥时一次性返回的完整信息（明文密钥仅此一次出现） */
export interface WorkflowEndpointSecretView extends WorkflowEndpointView {
  /** 完整明文密钥，创建/重置时返回一次 */
  key: string;
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
