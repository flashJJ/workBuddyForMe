import { createSubagentRunRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { AppSettings } from '@wbfm/shared/types';
import type { WorkSignal } from '@wbfm/shared';
import type {
  SubagentProviderInfo,
  SubagentRunInput,
  SubagentRunStatus,
  SubagentRunView,
} from '@wbfm/shared/schemas';
import { SUBAGENT_CLI_PROVIDER_ID } from '@wbfm/shared/schemas';
import type { ApprovalRegistry } from '../work-signal/approval-registry';
import { requestSubagentPermission, waitForRunApproval } from './subagent-approval';
import { isTerminalSubagentRun, subagentWorkSignal } from './subagent-signal';
import type {
  SubagentProvider,
  SubagentProviderRegistry,
  SubagentProviderResult,
} from './subagent-provider';
import { createCliSubagentProvider, type CliSubagentProviderOptions } from './cli-subagent-provider';
import { validateSubagentCwd } from './cli-command';
import { summarizeBinding } from '../governance';
import { buildSubagentGovernance, checkSubagentBinding } from './subagent-governance';

/**
 * v2.11 外部代理运行服务：
 * 审批（fail-closed）→ spawn → 证据（subagent_runs / WorkSignal / session_events）→ 幂等回投。
 * 未启用时注册表为空，对外零影响。
 */

const APPROVAL_TIMEOUT_MS = 5 * 60_000;

interface PendingRun {
  controller: AbortController;
  cancelled: boolean;
}

export interface SubagentRunServiceDeps {
  db: DatabaseInstance;
  providers: SubagentProviderRegistry;
  approvals: ApprovalRegistry;
  workSignals: { ingestSubagent(signal: WorkSignal): void };
  sessionLog: {
    record(input: {
      scope: 'agent';
      scopeId: string;
      type: string;
      payload: unknown;
    }): unknown;
  };
  completions: { completeSubagent(run: SubagentRunView): void };
  settings: { get(): AppSettings };
  /** 应用数据根目录（禁止作为 cwd） */
  dataRoot: string;
  /** 测试注入：替换真实 CLI 提供方 */
  providerFactory?: (options: CliSubagentProviderOptions) => SubagentProvider;
  /** 测试注入：审批等待上限 */
  approvalTimeoutMs?: number;
}

export function createSubagentRunService(deps: SubagentRunServiceDeps) {
  const repo = createSubagentRunRepository(deps.db);
  const pending = new Map<string, PendingRun>();
  const waiters = new Map<string, Array<(run: SubagentRunView) => void>>();
  const factory = deps.providerFactory ?? createCliSubagentProvider;
  const approvalTimeoutMs = deps.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS;
  let unregister: (() => void) | null = null;
  let registeredSignature: string | null = null;

  function refresh(): void {
    const settings = deps.settings.get();
    const command = (settings.subagentCliCommand ?? '').trim();
    const args = settings.subagentCliArgs ?? [];
    const enabled = settings.subagentCliEnabled === true && command !== '';
    if (!enabled) {
      unregister?.();
      unregister = null;
      registeredSignature = null;
      // 关闭即取消在途运行（审批等待与运行中一并收敛为 cancelled）
      for (const [id, entry] of pending) {
        entry.cancelled = true;
        deps.approvals.resolve(id, { action: 'deny' });
        entry.controller.abort();
      }
      return;
    }
    const signature = JSON.stringify([
      command,
      args,
      settings.subagentCliTimeoutMs,
      settings.subagentCliMaxOutputBytes,
    ]);
    if (signature === registeredSignature) return;
    unregister?.();
    unregister = deps.providers.register(
      factory({
        id: SUBAGENT_CLI_PROVIDER_ID,
        label: '本地 CLI 外部代理',
        command,
        args,
        timeoutMs: settings.subagentCliTimeoutMs ?? 600_000,
        maxOutputBytes: settings.subagentCliMaxOutputBytes ?? 2_097_152,
      }),
    );
    registeredSignature = signature;
  }

  function notifySettled(run: SubagentRunView): void {
    for (const resolve of waiters.get(run.id) ?? []) resolve(run);
    waiters.delete(run.id);
  }

  function finalize(
    run: SubagentRunView,
    result: SubagentProviderResult,
  ): void {
    const status: SubagentRunStatus =
      result.errorCode === 'budget_exceeded' ? 'budget_exceeded' : result.status;
    const updated = repo.finish(run.id, {
      status,
      summary: result.summary || null,
      errorCode: result.status === 'done' ? null : (result.errorCode ?? null),
      errorMessage: result.status === 'done' ? null : (result.error ?? null),
      outputBytes: result.outputBytes ?? 0,
    });
    pending.delete(run.id);
    if (updated) {
      deps.sessionLog.record({
        scope: 'agent',
        scopeId: run.id,
        type: 'subagent_finished',
        payload: {
          status,
          errorCode: updated.errorCode,
          outputBytes: updated.outputBytes,
          summary: updated.summary?.slice(0, 500) ?? null,
        },
      });
      const outcome = status === 'done' ? 'succeeded' : status === 'cancelled' ? 'cancelled' : 'failed';
      deps.workSignals.ingestSubagent(
        subagentWorkSignal(updated, outcome, null, updated.errorMessage, updated.endedAt),
      );
      deps.completions.completeSubagent(updated);
      notifySettled(updated);
    }
  }

  function waitForDecision(run: SubagentRunView, bindingSummary?: string, policyReason?: string) {
    return waitForRunApproval(deps.approvals, {
      run,
      timeoutMs: approvalTimeoutMs,
      isCancelled: () => pending.get(run.id)?.cancelled === true,
    }, bindingSummary, policyReason);
  }

  async function execute(
    run: SubagentRunView,
    provider: SubagentProvider,
    input: SubagentRunInput,
    cwd: string,
  ): Promise<void> {
    const entry: PendingRun = { controller: new AbortController(), cancelled: false };
    pending.set(run.id, entry);
    deps.workSignals.ingestSubagent(subagentWorkSignal(run, 'waiting', '等待运行审批', null));
    const settings = deps.settings.get();
    const governance = buildSubagentGovernance(settings, cwd);
    if (!governance.ok) {
      finalize(run, {
        status: 'cancelled',
        summary: '',
        error: governance.error,
        errorCode: governance.errorCode,
        outputBytes: 0,
      });
      return;
    }

    const decision = await waitForDecision(run, summarizeBinding(governance.binding, run.goal), 'MODE_ASK');
    if (decision !== 'allow') {
      const errorCode =
        decision === 'timeout' ? 'approval_timeout' : decision === 'deny' ? 'approval_denied' : 'cancelled';
      finalize(run, {
        status: 'cancelled',
        summary: '',
        error: decision === 'timeout' ? '审批超时' : decision === 'deny' ? '审批被拒绝' : '已取消',
        errorCode,
        outputBytes: 0,
      });
      return;
    }

    const bindingError = checkSubagentBinding(governance.binding, deps.settings.get(), cwd);
    if (bindingError) {
      finalize(run, {
        status: 'cancelled',
        summary: '',
        error: bindingError,
        errorCode: 'binding_drift',
        outputBytes: 0,
      });
      return;
    }

    repo.markStarted(run.id);
    const started = repo.get(run.id) ?? run;
    deps.sessionLog.record({
      scope: 'agent',
      scopeId: run.id,
      type: 'subagent_started',
      payload: {
        providerId: provider.id,
        goal: run.goal.slice(0, 200),
        cwd,
        conversationId: run.conversationId,
      },
    });
    deps.workSignals.ingestSubagent(subagentWorkSignal(started, 'running', '请求外部代理', null));

    let result: SubagentProviderResult;
    try {
      result = await provider.run(
        {
          goal: input.goal,
          conversationId: input.conversationId,
          budget: input.budget,
          cwd,
          requestPermission: (frame, signal) =>
            requestSubagentPermission(deps.approvals, started, frame, signal, approvalTimeoutMs),
        },
        entry.controller.signal,
      );
    } catch (error) {
      result = {
        status: 'failed',
        summary: '',
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'provider_error',
        outputBytes: 0,
      };
    }
    finalize(run, result);
  }

  return {
    refresh,

    providers(): SubagentProviderInfo[] {
      refresh();
      return deps.providers.list();
    },

    list(limit = 20): SubagentRunView[] {
      return repo.list(limit);
    },

    /** 创建运行并异步等待审批；立即返回 queued 记录 */
    start(input: SubagentRunInput): SubagentRunView {
      refresh();
      const provider = deps.providers.get(SUBAGENT_CLI_PROVIDER_ID);
      if (!provider) throw ApiError.validation('外部代理未启用或命令不可用');
      if (!provider.available()) throw ApiError.validation('外部代理命令不可用');
      const cwd = validateSubagentCwd(input.cwd, { dataRoot: deps.dataRoot });
      const run = repo.create({
        providerId: provider.id,
        goal: input.goal,
        cwd,
        conversationId: input.conversationId ?? null,
      });
      void execute(run, provider, input, cwd);
      return run;
    },

    cancel(id: string): SubagentRunView {
      const run = repo.get(id);
      if (!run) throw ApiError.notFound('外部代理运行', id);
      if (isTerminalSubagentRun(run.status)) return run;
      const entry = pending.get(id);
      if (entry) {
        entry.cancelled = true;
        deps.approvals.resolve(id, { action: 'deny' });
        entry.controller.abort();
      }
      return repo.get(id) ?? run;
    },

    /** 测试/内部等待终态（不含超时；调用方自行控制） */
    whenSettled(id: string): Promise<SubagentRunView> {
      const run = repo.get(id);
      if (!run) return Promise.reject(ApiError.notFound('外部代理运行', id));
      if (isTerminalSubagentRun(run.status)) return Promise.resolve(run);
      return new Promise((resolve) => {
        const list = waiters.get(id) ?? [];
        list.push(resolve);
        waiters.set(id, list);
      });
    },
  };
}

export type SubagentRunService = ReturnType<typeof createSubagentRunService>;
