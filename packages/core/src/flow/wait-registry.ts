/**
 * Flow 运行挂起等待注册表（v0.8 M1）：
 * 人工节点与 write/danger 工具确认共用，key 为 `${runId}:human|tool:${nodeId}`。
 * 进程内存实现（单实例本地应用），与 PendingConfirmations 同构：
 * - 关键时序：request() 同步注册挂起项并返回 Promise，引擎随后才发 SSE 事件；
 * - abort（SSE 断线/取消）自动以 undefined 结束，调用方按拒绝处理；
 * - 不设超时：试运行人工审核可长时间挂起，生命周期跟随 SSE 连接（跨进程恢复为 v0.9）。
 */
export interface FlowWaitRegistry {
  request(key: string, signal?: AbortSignal): Promise<unknown>;
  /** 提交等待结果；key 不存在/已结束返回 false */
  resolve(key: string, payload: unknown): boolean;
  size(): number;
  clear(): void;
}

interface WaitEntry {
  resolve: (payload: unknown) => void;
}

export function createFlowWaitRegistry(): FlowWaitRegistry {
  const pending = new Map<string, WaitEntry>();

  return {
    request(key, signal) {
      // 重复 key 防御：释放旧挂起项
      pending.get(key)?.resolve(undefined);
      return new Promise<unknown>((resolvePromise) => {
        let settled = false;
        const finish = (payload: unknown) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          pending.delete(key);
          resolvePromise(payload);
        };
        const onAbort = () => finish(undefined);
        pending.set(key, { resolve: finish });
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    resolve(key, payload) {
      const entry = pending.get(key);
      if (!entry) return false;
      entry.resolve(payload);
      return true;
    },

    size() {
      return pending.size;
    },

    clear() {
      for (const entry of pending.values()) entry.resolve(undefined);
      pending.clear();
    },
  };
}
