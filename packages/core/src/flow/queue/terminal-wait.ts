import { FLOW_RUN_TERMINAL_STATUSES } from '@wbfm/shared/types';
import { type WorkflowRunView } from '@wbfm/shared/types';
import type { FlowEventBus } from './event-bus';

/**
 * v0.9 终态等待器（公开 API 同步调用 / MCP tools/call 复用）：
 * 纯等待者——不占用队列执行者、不影响运行生命周期。
 * EventBus 事件为主、DB 定时轮询兜底（缓冲缺失等极端时序）；
 * 超时返回 timedOut，运行仍在后台继续，调用方转异步语义。
 */
export interface TerminalWaitResult {
  timedOut: boolean;
  run: WorkflowRunView | null;
}

export interface TerminalWaitDeps {
  bus: FlowEventBus;
  getRun: (runId: string) => WorkflowRunView | null;
  /** 轮询兜底间隔/时钟可注入（测试用），默认 1s */
  pollMs?: number;
}

export function isTerminalRun(run: WorkflowRunView | null): boolean {
  return Boolean(run && FLOW_RUN_TERMINAL_STATUSES.includes(run.status));
}

export function waitForRunTerminal(
  deps: TerminalWaitDeps,
  runId: string,
  timeoutMs: number,
): Promise<TerminalWaitResult> {
  const immediate = deps.getRun(runId);
  if (isTerminalRun(immediate)) return Promise.resolve({ timedOut: false, run: immediate });

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const pollMs = deps.pollMs ?? 1_000;
    // 定时器先建（回调经函数声明提升懒引用 check/finish），满足 prefer-const
    const pollTimer = setInterval(() => check(), pollMs);
    const timeoutTimer = setTimeout(() => finish(true), timeoutMs);
    pollTimer.unref?.();
    timeoutTimer.unref?.();
    function finish(timedOut: boolean) {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      resolve({ timedOut, run: deps.getRun(runId) });
    }
    function check() {
      if (isTerminalRun(deps.getRun(runId))) finish(false);
    }
    unsubscribe = deps.bus.subscribe(runId, () => check());
    check();
  });
}
