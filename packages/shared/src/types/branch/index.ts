/**
 * v2.21 分支会话契约：父子会话关系、状态机与回传证据。
 * 状态只表达分支生命周期；归档用 archivedAt 与状态正交。
 */

export const BRANCH_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
] as const;

export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export const BRANCH_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
] as const satisfies readonly BranchStatus[];

/** 四项上限默认值；设置页可覆盖（M2 接线） */
export const BRANCH_LIMITS = {
  maxConcurrent: 3,
  maxDepth: 2,
  maxChildren: 6,
  maxTreeTokens: 200_000,
} as const;

export const BRANCH_LIMIT_RANGES = {
  maxConcurrent: { min: 1, max: 10 },
  maxDepth: { min: 1, max: 4 },
  maxChildren: { min: 1, max: 20 },
  maxTreeTokens: { min: 10_000, max: 1_000_000 },
} as const;

export interface BranchArtifactRef {
  id: string;
  title: string;
  kind: string;
}

export interface BranchEvidence {
  branchId: string;
  parentConversationId: string;
  childConversationId: string;
  rootConversationId: string;
  status: BranchStatus;
  summary: string;
  artifacts: BranchArtifactRef[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  /** 固定为真：父会话先核对再汇总 */
  needsReview: true;
  createdAt: string;
}

export interface ConversationBranch {
  id: string;
  parentConversationId: string;
  childConversationId: string;
  rootConversationId: string;
  title: string;
  goal: string;
  status: BranchStatus;
  statusReason: string | null;
  reservedTokens: number;
  depth: number;
  archivedAt: string | null;
  evidence: BranchEvidence | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 派生准入所需的会话树快照（由仓储查询后交给纯函数） */
export interface BranchAdmissionInput {
  depth: number;
  ancestorIds: readonly string[];
  activeCount: number;
  childCount: number;
  usedTokens: number;
  reservedTokens: number;
}

export type BranchAdmissionRejection =
  | 'BRANCH_CYCLE'
  | 'BRANCH_DEPTH_EXCEEDED'
  | 'BRANCH_CHILDREN_EXCEEDED'
  | 'BRANCH_CONCURRENCY_EXCEEDED'
  | 'BRANCH_BUDGET_EXCEEDED';

export interface BranchLimits {
  maxConcurrent: number;
  maxDepth: number;
  maxChildren: number;
  maxTreeTokens: number;
}

/** v2.21：四项上限的可选设置字段（app-settings JSON；缺省回 BRANCH_LIMITS） */
export interface BranchLimitSettings {
  branchMaxConcurrent?: number;
  branchMaxDepth?: number;
  branchMaxChildren?: number;
  branchTokenBudget?: number;
}

/** v2.21 M3：预算视图（按会话树聚合；used 来自消息 usage，reserved 来自未结分支预留） */
export interface BranchBudget {
  rootConversationId: string;
  usedTokens: number;
  reservedTokens: number;
  limitTokens: number;
  activeCount: number;
}
