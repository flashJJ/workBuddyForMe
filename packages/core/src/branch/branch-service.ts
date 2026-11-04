import { randomUUID } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import type { BranchBudget, BranchLimits, ConversationBranch } from '@wbfm/shared/types';
import { branchCreateSchema, type BranchCreateInput } from '@wbfm/shared/schemas';
import {
  createConversationBranchRepository,
  createConversationRepository,
  createMessageRepository,
  createSessionEventRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';
import { createConversationService, deriveTitle } from '../services/assistant/conversation-service';
import { createChatOrchestrator } from '../chat/orchestrator/chat-orchestrator';
import {
  BRANCH_REJECTION_TEXT,
  evaluateBranchAdmission,
  reserveBranchTokens,
} from './branch-limits';
import { createBranchEventRecorder } from './branch-events';
import { buildBranchEvidence, collectBranchArtifacts } from './branch-evidence';
import { readBranchLimits } from './branch-settings';
import { recoverInterruptedBranches } from './branch-recovery';
import { readTreeUsage, resolveBranchTree } from './branch-tree';
import { runBranchChat, type BranchRunResult, type BranchChatRunner } from './branch-runner';

const START_RESERVATION_TOKENS = 1000;

export interface BranchServiceOptions {
  /** 测试注入；缺省使用真实聊天编排器 */
  runner?: BranchChatRunner;
}

export function createBranchService(deps: ServiceDeps, options: BranchServiceOptions = {}) {
  const branchRepo = createConversationBranchRepository(deps.db);
  const conversationsRepo = createConversationRepository(deps.db);
  const messagesRepo = createMessageRepository(deps.db);
  const conversations = createConversationService(deps);
  const events = createBranchEventRecorder(createSessionEventRepository(deps.db));
  const runner = options.runner ?? createChatOrchestrator(deps).streamChat;
  const running = new Map<string, { controller: AbortController; promise: Promise<void> }>();

  const readLimits = (): BranchLimits => readBranchLimits(deps.db);

  const requireBranch = (id: string): ConversationBranch => {
    const branch = branchRepo.get(id);
    if (!branch) throw ApiError.notFound('分支', id);
    return branch;
  };

  const resolveTree = (parentConversationId: string) =>
    resolveBranchTree(branchRepo, parentConversationId);

  const treeUsage = (rootConversationId: string) =>
    readTreeUsage(branchRepo, messagesRepo, rootConversationId);

  const evidenceFor = (
    branch: ConversationBranch,
    result: BranchRunResult,
    status?: BranchRunResult['status'] | 'budget_exceeded',
  ) =>
    buildBranchEvidence(
      branch,
      result,
      collectBranchArtifacts(messagesRepo, branch.childConversationId),
      status,
    );

  const finalize = (branchId: string, result: BranchRunResult): void => {
    const branch = branchRepo.get(branchId);
    if (!branch) return;
    const limits = readLimits();
    const usage = treeUsage(branch.rootConversationId);
    // v2.22：结算时熔断——成功结果若使会话树越过 Token 上限，改判预算超限
    const breached =
      result.status === 'succeeded' &&
      usage.usedTokens + usage.reservedTokens > limits.maxTreeTokens;
    const status = breached ? 'budget_exceeded' : result.status;
    const reason = breached
      ? `会话树 Token 超限：已用 ${usage.usedTokens} / 上限 ${limits.maxTreeTokens}`
      : result.status === 'failed'
        ? result.errorMessage ?? '分支运行失败'
        : result.status === 'cancelled'
          ? '分支已取消'
          : null;
    const evidence = evidenceFor(branch, result, status);
    const updated = branchRepo.patch(branchId, {
      status,
      statusReason: reason,
      evidence,
      reservedTokens: 0,
      endedAt: new Date().toISOString(),
    });
    if (!updated) return;
    events.status(updated, status, reason);
    events.returned(updated, status, evidence, reason);
  };

  const run = (branch: ConversationBranch): ConversationBranch => {
    const controller = new AbortController();
    const limits = readLimits();
    const usage = treeUsage(branch.rootConversationId);
    // 创建时只校验一次并发；排队分支集中启动时必须复检，避免越过 running+waiting 上限
    if (usage.activeCount >= limits.maxConcurrent) {
      throw ApiError.validation(`分支准入拒绝：${BRANCH_REJECTION_TEXT.BRANCH_CONCURRENCY_EXCEEDED}`);
    }
    const reservation = reserveBranchTokens(
      START_RESERVATION_TOKENS,
      limits,
      usage.usedTokens,
      usage.reservedTokens,
    );
    if (reservation === 0) {
      throw ApiError.validation(`分支准入拒绝：${BRANCH_REJECTION_TEXT.BRANCH_BUDGET_EXCEEDED}`);
    }
    const started = branchRepo.patch(branch.id, {
      status: 'running',
      statusReason: null,
      evidence: null,
      reservedTokens: reservation,
      endedAt: null,
    })!;
    events.started(started);
    const promise = runBranchChat(
      runner,
      {
        assistantId: conversationsRepo.findById(branch.parentConversationId)!.assistantId,
        conversationId: branch.childConversationId,
        content: branch.goal,
      },
      controller.signal,
    ).then((result) => finalize(branch.id, result));
    running.set(branch.id, { controller, promise });
    void promise.finally(() => running.delete(branch.id));
    return started;
  };

  return {
    list(parentConversationId: string, includeArchived = false): ConversationBranch[] {
      return branchRepo.listByParent(parentConversationId, includeArchived);
    },

    get(id: string): ConversationBranch {
      return requireBranch(id);
    },

    /** v2.21 M3：子会话反查来源分支（子会话顶部来源条用） */
    findByChild(childConversationId: string): ConversationBranch | null {
      return branchRepo.findByChild(childConversationId);
    },

    rename(id: string, title: string): ConversationBranch {
      requireBranch(id);
      const renamed = branchRepo.patch(id, { title })!;
      // 补事件让 RunGraph 车道/节点标题随重命名收敛
      events.status(renamed, renamed.status, renamed.statusReason);
      return renamed;
    },

    create(
      parentConversationId: string,
      input: BranchCreateInput,
    ): { branch: ConversationBranch; childConversationId: string } {
      const parsed = branchCreateSchema.parse(input);
      const parent = conversationsRepo.findById(parentConversationId);
      if (!parent) throw ApiError.notFound('会话', parentConversationId);
      const tree = resolveTree(parentConversationId);
      const limits = readLimits();
      const usage = treeUsage(tree.rootConversationId);
      const admission = evaluateBranchAdmission(
        {
          ancestorIds: tree.ancestorIds,
          childConversationId: 'pending',
          depth: tree.depth,
          activeCount: usage.activeCount,
          childCount: branchRepo.listByParent(parentConversationId).length,
          usedTokens: usage.usedTokens,
          reservedTokens: usage.reservedTokens,
        },
        limits,
      );
      if (!admission.ok) {
        throw ApiError.validation(`分支准入拒绝：${BRANCH_REJECTION_TEXT[admission.code]}`);
      }
      const title = parsed.title ?? deriveTitle(parsed.goal);
      let childConversationId = '';
      const branch = deps.db.transaction(() => {
        const child = conversations.create(parent.assistantId, title);
        // 继承父会话显式选择的模型；未选择时沿用助手/阶段默认
        if (parent.modelId) conversationsRepo.setModelId(child.id, parent.modelId);
        childConversationId = child.id;
        return branchRepo.create({
          id: randomUUID(),
          parentConversationId,
          childConversationId: child.id,
          rootConversationId: tree.rootConversationId,
          title,
          goal: parsed.goal,
          depth: tree.depth,
        });
      })();
      events.created(branch);
      if (parsed.autoStart) run(branch);
      return { branch: branchRepo.get(branch.id)!, childConversationId };
    },

    start(id: string): ConversationBranch {
      const branch = requireBranch(id);
      if (branch.status === 'running' || branch.status === 'waiting') return branch;
      // 契约：终态不可回 running；只有 queued 可启动
      if (branch.status !== 'queued') {
        throw ApiError.validation(`分支状态不可启动：${branch.status}`);
      }
      return run(branch);
    },

    cancel(id: string): ConversationBranch {
      const branch = requireBranch(id);
      const active = running.get(id);
      if (active) {
        active.controller.abort();
        return branchRepo.get(id) ?? branch;
      }
      const reason = '分支已取消';
      const cancelled = branchRepo.patch(id, {
        status: 'cancelled',
        statusReason: reason,
        reservedTokens: 0,
        endedAt: new Date().toISOString(),
      })!;
      // v2.22：无运行结果的终态也写回传，父会话不再「静默结束」
      const empty: BranchRunResult = {
        status: 'cancelled',
        content: '',
        usage: null,
        errorCode: null,
        errorMessage: null,
      };
      const evidence = evidenceFor(cancelled, empty, 'cancelled');
      const withEvidence = branchRepo.patch(id, { evidence })!;
      events.status(withEvidence, 'cancelled', reason);
      events.returned(withEvidence, 'cancelled', evidence, reason);
      return withEvidence;
    },

    archive(id: string): ConversationBranch {
      requireBranch(id);
      const archived = branchRepo.patch(id, { archivedAt: new Date().toISOString() })!;
      // 归档态写 branch_status 事件，供图车道默认折叠
      events.status(archived, archived.status, archived.statusReason);
      return archived;
    },

    restore(id: string): ConversationBranch {
      requireBranch(id);
      const restored = branchRepo.patch(id, { archivedAt: null })!;
      events.status(restored, restored.status, restored.statusReason);
      return restored;
    },

    /** 删除关联；子会话与消息保留为普通会话；运行中先停止并等待终态 */
    async remove(id: string): Promise<{ id: string }> {
      const branch = requireBranch(id);
      const active = running.get(id);
      if (active) {
        active.controller.abort();
        await active.promise;
      }
      branchRepo.delete(branch.id);
      return { id };
    },

    /** v2.21 M4：启动收敛上次残留的运行中分支；返回收敛条数 */
    recoverInterrupted(reason = '进程重启，分支已中断'): number {
      return recoverInterruptedBranches(branchRepo, events, reason);
    },
    /** 测试/优雅关闭：等待某分支运行结束 */
    async whenSettled(id: string): Promise<void> {
      await running.get(id)?.promise;
    },

    limits(): BranchLimits {
      return readLimits();
    },

    /** v2.21 M3：预算视图按会话树聚合（根会话 + 全部分支子会话） */
    budget(conversationId: string): BranchBudget {
      const tree = resolveTree(conversationId);
      const usage = treeUsage(tree.rootConversationId);
      return {
        rootConversationId: tree.rootConversationId,
        usedTokens: usage.usedTokens,
        reservedTokens: usage.reservedTokens,
        limitTokens: readLimits().maxTreeTokens,
        activeCount: usage.activeCount,
      };
    },
  };
}

export type BranchService = ReturnType<typeof createBranchService>;
