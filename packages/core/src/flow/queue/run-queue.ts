import type { WorkflowRunView } from '@wbfm/shared';

/**
 * v0.9 进程内运行队列（单执行者、顺序拾取）：
 * - enqueue 只放内存信号；真正的执行权以 DB 原子认领（claimQueued）为准，
 *   重复信号/重复 tick 不会导致同一 run 双跑；
 * - 自调度链（setImmediate 链式），无固定轮询间隔；
 * - 跨进程/多实例分布式锁明确不在 v1 范围（本地 server 单实例）。
 */
export interface FlowRunQueue {
  /** 入队一个 queued run（幂等：重复入队只保留一个待办信号） */
  enqueue(runId: string): void;
  /** 当前待拾取信号数（测试/观测用） */
  pendingSize(): number;
  /** 是否在执行中（补偿扫描据此跳过） */
  hasInFlight(runId: string): boolean;
}

export interface FlowRunQueueDeps {
  /** DB 原子认领：抢到返回 run 视图，否则 null */
  claim: (runId: string) => WorkflowRunView | null;
  /** 执行一个已认领的 run（实现方负责迭代到终态） */
  execute: (run: WorkflowRunView) => Promise<void>;
  /** 执行异常兜底（记录日志等），不抛出 */
  onError?: (runId: string, error: unknown) => void;
}

export function createFlowRunQueue(deps: FlowRunQueueDeps): FlowRunQueue {
  const pending: string[] = [];
  const inFlight = new Set<string>();
  let scheduling = false;

  async function tick(): Promise<void> {
    // 先放行调度标志：执行期间新来的 enqueue 可以立即挂上下一个 tick；
    // 与 finally 的 schedule 通过 scheduling 标志去重，不会重复/漏调。
    scheduling = false;
    const runId = pending.shift();
    if (!runId) return;
    if (inFlight.has(runId)) {
      schedule();
      return;
    }
    let run: WorkflowRunView | null;
    try {
      run = deps.claim(runId);
    } catch (error) {
      // DB 临时不可用（如关闭窗口）：不使 tick 变成 unhandled rejection，
      // 补偿扫描/下一次 enqueue 会重新拾取本 run。
      deps.onError?.(runId, error);
      if (pending.length > 0) schedule();
      return;
    }
    if (!run) {
      // 已被别处认领/状态不再是 queued（恢复扫描等场景）
      if (pending.length > 0) schedule();
      return;
    }
    inFlight.add(runId);
    try {
      await deps.execute(run);
    } catch (error) {
      deps.onError?.(runId, error);
    } finally {
      inFlight.delete(runId);
      if (pending.length > 0) schedule();
    }
  }

  function schedule(): void {
    if (scheduling) return;
    scheduling = true;
    setImmediate(() => {
      void tick();
    });
  }

  return {
    enqueue(runId) {
      if (!pending.includes(runId)) pending.push(runId);
      schedule();
    },
    pendingSize() {
      return pending.length;
    },
    hasInFlight(runId) {
      return inFlight.has(runId);
    },
  };
}
