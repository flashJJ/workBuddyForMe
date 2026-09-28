/**
 * HITL 挂起确认注册表：orchestrator 遇到未授权工具时挂起当前调用，
 * 等待 /api/tools/confirm 端点 resolve；超时或客户端中断自动拒绝。
 * 进程内存实现（单实例本地应用），无需持久化。
 */
export type ConfirmationDecision = 'allow' | 'deny';

interface PendingEntry {
  resolve: (decision: ConfirmationDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PendingConfirmations {
  /** 挂起等待确认；超时/abort 自动 deny（同一时刻同一 callId 仅一条） */
  request(callId: string, signal?: AbortSignal): Promise<ConfirmationDecision>;
  /** 确认端点调用；返回 false 表示 callId 不存在或已超时 */
  resolve(callId: string, decision: ConfirmationDecision): boolean;
  /** 当前挂起数量（测试/观测用） */
  size(): number;
  /** 清理全部挂起（测试） */
  clear(): void;
}

export const CONFIRMATION_TIMEOUT_MS = 120_000;

export function createPendingConfirmations(
  timeoutMs: number = CONFIRMATION_TIMEOUT_MS,
): PendingConfirmations {
  const pending = new Map<string, PendingEntry>();

  return {
    request(callId, signal) {
      // 防御：重复 callId 直接拒绝旧条目（正常流程不会触发）
      pending.get(callId)?.resolve('deny');
      return new Promise<ConfirmationDecision>((resolvePromise) => {
        let settled = false;
        const finish = (decision: ConfirmationDecision) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(callId);
          signal?.removeEventListener('abort', onAbort);
          resolvePromise(decision);
        };
        const timer = setTimeout(() => finish('deny'), timeoutMs);
        // 不阻止进程退出（测试/桌面进程收尾）
        (timer as { unref?: () => void }).unref?.();
        const onAbort = () => finish('deny');
        pending.set(callId, { resolve: finish, timer });
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    resolve(callId, decision) {
      const entry = pending.get(callId);
      if (!entry) return false;
      entry.resolve(decision);
      return true;
    },

    size() {
      return pending.size;
    },

    clear() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
  };
}
