import type { FlowEventPayload } from '@wbfm/shared/types';

/**
 * v0.9 进程内流程事件总线：
 * - 执行者（队列）publish 事件；观察者（SSE 连接、同步等待者）subscribe；
 * - 每个 run 保留完整事件缓冲：订阅建立时先同步补发历史，再接实时，
 *   因此「先执行后订阅」「多观察者」「观察者断线重连（同进程）」都不会丢事件；
 * - 缓冲只活在进程内：进程重启后历史走 node_executions 回放（路由层判定）。
 *
 * v1 单进程单执行者，缓冲无界但量小（顺序执行、单 run 事件数 = 节点数级）。
 */
interface BusEntry {
  events: FlowEventPayload[];
  listeners: Set<(event: FlowEventPayload) => void>;
}

export interface FlowEventBus {
  publish(runId: string, event: FlowEventPayload): void;
  /** 订阅实时事件；返回取消函数 */
  subscribe(runId: string, listener: (event: FlowEventPayload) => void): () => void;
  /** 当前缓冲（按发生顺序）；run 在本进程从未执行过返回 null */
  snapshot(runId: string): FlowEventPayload[] | null;
  /** 终态后回收缓冲（取消订阅全部完成后可选调用）；返回被回收的事件数 */
  dispose(runId: string): number;
}

export function createFlowEventBus(): FlowEventBus {
  const entries = new Map<string, BusEntry>();

  function entry(runId: string): BusEntry {
    let e = entries.get(runId);
    if (!e) {
      e = { events: [], listeners: new Set() };
      entries.set(runId, e);
    }
    return e;
  }

  return {
    publish(runId, event) {
      const e = entry(runId);
      e.events.push(event);
      for (const listener of [...e.listeners]) {
        try {
          listener(event);
        } catch {
          // 监听器异常不影响执行与其他订阅者
        }
      }
    },
    subscribe(runId, listener) {
      const e = entry(runId);
      e.listeners.add(listener);
      return () => {
        e.listeners.delete(listener);
      };
    },
    snapshot(runId) {
      return entries.get(runId)?.events ?? null;
    },
    dispose(runId) {
      const e = entries.get(runId);
      if (!e) return 0;
      const count = e.events.length;
      entries.delete(runId);
      return count;
    },
  };
}

export function isTerminalFlowEvent(event: FlowEventPayload): boolean {
  return (
    event.type === 'run_succeeded' ||
    event.type === 'run_failed' ||
    event.type === 'run_cancelled'
  );
}
