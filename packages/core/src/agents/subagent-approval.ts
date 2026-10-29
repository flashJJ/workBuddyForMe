import type { SubagentRunView } from '@wbfm/shared/schemas';
import type { ApprovalDecision, ApprovalRegistry } from '../work-signal/approval-registry';

/**
 * v2.11 外部代理的两层审批：
 * - 运行审批（spawn 前，id = runId）：拒绝/超时 → 不启动进程；
 * - 子进程 permission 帧（id = runId:perm:<id>）：拒绝只回写 allow=false。
 * 全部 fail-closed：超时、取消、回调异常一律按拒绝处理。
 */

export type RunApprovalOutcome = 'allow' | 'deny' | 'timeout' | 'cancelled';

export interface RunApprovalContext {
  run: SubagentRunView;
  timeoutMs: number;
  /** 用户取消标记（cancel 服务或关闭开关置位） */
  isCancelled: () => boolean;
}

export function waitForRunApproval(
  approvals: ApprovalRegistry,
  context: RunApprovalContext,
): Promise<RunApprovalOutcome> {
  const { run, timeoutMs } = context;
  return new Promise((resolve) => {
    let done = false;
    const timers: { current?: NodeJS.Timeout } = {};
    const finish = (value: RunApprovalOutcome): void => {
      if (done) return;
      done = true;
      if (timers.current) clearTimeout(timers.current);
      handle.remove();
      resolve(value);
    };
    const handle = approvals.register(
      {
        id: run.id,
        source: 'subagent',
        title: '运行外部代理',
        tool: 'subagent',
        permission: 'danger',
        argsSummary: run.goal.slice(0, 200),
        runId: run.id,
        conversationId: run.conversationId,
        expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
        deepLink: `/capabilities?run=${run.id}`,
      },
      (decision: ApprovalDecision) => {
        if (context.isCancelled()) return finish('cancelled');
        finish(decision.action === 'allow' ? 'allow' : 'deny');
      },
    );
    timers.current = setTimeout(() => {
      approvals.remove(run.id);
      finish('timeout');
    }, timeoutMs);
    timers.current.unref?.();
  });
}

export function requestSubagentPermission(
  approvals: ApprovalRegistry,
  run: SubagentRunView,
  frame: { id: string; title: string; detail?: string },
  signal: AbortSignal,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `${run.id}:perm:${frame.id}`;
    let done = false;
    const timers: { current?: NodeJS.Timeout } = {};
    const finish = (allow: boolean): void => {
      if (done) return;
      done = true;
      if (timers.current) clearTimeout(timers.current);
      signal.removeEventListener('abort', onAbort);
      handle.remove();
      resolve(allow);
    };
    const onAbort = (): void => {
      approvals.remove(id);
      finish(false);
    };
    const handle = approvals.register(
      {
        id,
        source: 'subagent',
        title: `子进程授权：${frame.title}`.slice(0, 120),
        tool: 'subagent',
        permission: 'write',
        argsSummary: frame.detail ?? null,
        runId: run.id,
        conversationId: run.conversationId,
        expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
        deepLink: `/capabilities?run=${run.id}`,
      },
      (decision: ApprovalDecision) => finish(decision.action === 'allow'),
    );
    timers.current = setTimeout(() => {
      approvals.remove(id);
      finish(false);
    }, timeoutMs);
    timers.current.unref?.();
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}
