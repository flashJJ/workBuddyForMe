import type { ApprovalSource, WorkApproval } from '@wbfm/shared';

export interface ApprovalDecision {
  action: 'allow' | 'deny';
  /** 人工节点表单值（工具审批忽略） */
  values?: Record<string, unknown>;
}

export interface RegisterApprovalInput {
  id: string;
  source: ApprovalSource;
  title: string;
  tool?: string | null;
  permission?: WorkApproval['permission'];
  argsSummary?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  createdAt?: string;
  expiresAt?: string | null;
  deepLink: string;
}

export interface ApprovalHandle {
  id: string;
  /** 底层确认超时/断线/运行结束时调用，避免僵尸审批 */
  remove(): void;
}

export type ApprovalResolver = (decision: ApprovalDecision) => void;

export interface ApprovalRegistry {
  register(input: RegisterApprovalInput, onResolve: ApprovalResolver): ApprovalHandle;
  /** 审批中心/桌宠调用；不存在或已结束时返回 false */
  resolve(id: string, decision: ApprovalDecision): boolean;
  remove(id: string): void;
  list(): WorkApproval[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

interface Entry {
  item: WorkApproval;
  onResolve: ApprovalResolver;
}

/**
 * v2.7 审批统一收件箱（进程内单实例）。
 * 只做「一次性允许/拒绝」；remember 策略仍由原对话框处理。
 */
export function createApprovalRegistry(): ApprovalRegistry {
  const pending = new Map<string, Entry>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const remove = (id: string) => {
    if (!pending.delete(id)) return;
    notify();
  };

  return {
    register(input, onResolve) {
      const item: WorkApproval = {
        id: input.id,
        source: input.source,
        title: input.title,
        tool: input.tool ?? null,
        permission: input.permission ?? null,
        argsSummary: input.argsSummary ?? null,
        runId: input.runId ?? null,
        conversationId: input.conversationId ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
        expiresAt: input.expiresAt ?? null,
        deepLink: input.deepLink,
      };
      // 重复 id：先释放旧条目，避免同一确认被两处等待
      pending.get(item.id)?.onResolve({ action: 'deny' });
      pending.set(item.id, { item, onResolve });
      notify();
      return { id: item.id, remove: () => remove(item.id) };
    },

    resolve(id, decision) {
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      try {
        entry.onResolve(decision);
      } finally {
        notify();
      }
      return true;
    },

    remove,

    list() {
      return [...pending.values()]
        .map((entry) => entry.item)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    clear() {
      if (pending.size === 0) return;
      pending.clear();
      notify();
    },
  };
}
