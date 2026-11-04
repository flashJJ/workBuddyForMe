import type {
  BranchAdmissionRejection,
  BranchLimits,
  ConversationBranch,
} from '@wbfm/shared/types';
import { BRANCH_LIMITS } from '@wbfm/shared/types';

/** v2.21 M1：派生准入纯函数；顺序固定为 环 → 深度 → 子节点 → 并发 → 预算。 */

/** 准入失败原因码到用户文案（API 422 与前端展示共用） */
export const BRANCH_REJECTION_TEXT: Record<BranchAdmissionRejection, string> = {
  BRANCH_CYCLE: '分支祖先链出现环',
  BRANCH_DEPTH_EXCEEDED: '超过最大分支深度',
  BRANCH_CHILDREN_EXCEEDED: '父会话分支数已达上限',
  BRANCH_CONCURRENCY_EXCEEDED: '并发分支数已达上限',
  BRANCH_BUDGET_EXCEEDED: '会话树 Token 预算已用尽',
};

export interface BranchAdmissionSnapshot {
  /** 从根到父的祖先链（含父会话 id） */
  ancestorIds: readonly string[];
  /** 新子会话 id；用于防御性环检测 */
  childConversationId: string;
  /** 新分支深度（根为 1） */
  depth: number;
  /** 会话树内 running + waiting 分支数 */
  activeCount: number;
  /** 父会话未归档分支数 */
  childCount: number;
  /** 会话树已用 Token */
  usedTokens: number;
  /** 会话树已预留 Token */
  reservedTokens: number;
}

export type BranchAdmissionResult =
  | { ok: true }
  | { ok: false; code: BranchAdmissionRejection };

export function evaluateBranchAdmission(
  input: BranchAdmissionSnapshot,
  limits: BranchLimits = BRANCH_LIMITS,
): BranchAdmissionResult {
  if (input.ancestorIds.includes(input.childConversationId)) {
    return { ok: false, code: 'BRANCH_CYCLE' };
  }
  if (input.depth > limits.maxDepth) {
    return { ok: false, code: 'BRANCH_DEPTH_EXCEEDED' };
  }
  if (input.childCount >= limits.maxChildren) {
    return { ok: false, code: 'BRANCH_CHILDREN_EXCEEDED' };
  }
  if (input.activeCount >= limits.maxConcurrent) {
    return { ok: false, code: 'BRANCH_CONCURRENCY_EXCEEDED' };
  }
  if (input.usedTokens + input.reservedTokens >= limits.maxTreeTokens) {
    return { ok: false, code: 'BRANCH_BUDGET_EXCEEDED' };
  }
  return { ok: true };
}

/** 剩余预算按预估预留；至少预留 1，触顶时返回 0 由准入拒绝。 */
export function reserveBranchTokens(
  estimatedTokens: number,
  limits: BranchLimits = BRANCH_LIMITS,
  usedTokens = 0,
  reservedTokens = 0,
): number {
  const remaining = limits.maxTreeTokens - usedTokens - reservedTokens;
  if (remaining <= 0) return 0;
  return Math.min(Math.max(estimatedTokens, 1), remaining);
}

/* v2.22：会话树读取（从 branch-service 抽出，控制主服务行数） */

export interface BranchTreeReader {
  findByChild(childConversationId: string): ConversationBranch | null;
  listByRoot(rootConversationId: string): ConversationBranch[];
}

export interface TokenUsageReader {
  sumTokensForConversations(ids: string[]): number;
}

export interface BranchTree {
  rootConversationId: string;
  depth: number;
  /** 根→父（含父）的会话 id 链，用于环检测 */
  ancestorIds: string[];
}

/** 沿父链回溯根会话与深度；最多 10 层防御环 */
export function resolveBranchTree(
  repo: BranchTreeReader,
  parentConversationId: string,
): BranchTree {
  const ancestorIds = [parentConversationId];
  let cursor = parentConversationId;
  let rootConversationId = parentConversationId;
  let parentDepth = 0;
  for (let guard = 0; guard < 10; guard += 1) {
    const parentBranch = repo.findByChild(cursor);
    if (!parentBranch) break;
    rootConversationId = parentBranch.rootConversationId;
    parentDepth = parentBranch.depth;
    ancestorIds.unshift(parentBranch.parentConversationId);
    cursor = parentBranch.parentConversationId;
  }
  return { rootConversationId, depth: parentDepth + 1, ancestorIds };
}

/** 聚合会话树（根 + 全部子会话）的已用与预留 Token */
export function readTreeUsage(
  repo: BranchTreeReader,
  messagesRepo: TokenUsageReader,
  rootConversationId: string,
): { usedTokens: number; reservedTokens: number; activeCount: number } {
  const branches = repo.listByRoot(rootConversationId);
  const ids = [rootConversationId, ...branches.map((branch) => branch.childConversationId)];
  return {
    usedTokens: messagesRepo.sumTokensForConversations(ids),
    reservedTokens: branches.reduce((sum, branch) => sum + branch.reservedTokens, 0),
    activeCount: branches.filter(
      (branch) => branch.status === 'running' || branch.status === 'waiting',
    ).length,
  };
}
