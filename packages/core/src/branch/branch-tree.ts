/**
 * v2.22：分支会话树读取（从 branch-service 抽出，控制主服务行数）。
 * resolveBranchTree 处理祖先链/根/深度；readTreeUsage 聚合已用与预留 Token。
 */
import type { ConversationBranch } from '@wbfm/shared/types';

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
