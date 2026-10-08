import { TOOL_BREAKER_COOLDOWN_MS, TOOL_BREAKER_FAILURE_THRESHOLD } from '@wbfm/shared/constants';

/**
 * 工具熔断器（v0.6 M4）：跨轮次全局状态，跟踪连续失败的 MCP/内置工具。
 *
 * 状态机：
 * - closed：正常放行；记录失败时计数累加，达到阈值转 open。
 * - open：拒绝执行；cooldown 到期后转 half-open（允许一次试探）。
 * - half-open：放行一次；成功 → closed，失败 → open（重新计时）。
 *
 * 全部状态走进程内存：重启清空，避免持久化误锁；5 分钟 cooldown 兼顾快速恢复与隔离。
 */
export type BreakerStatus = 'closed' | 'open' | 'half-open';

interface BreakerEntry {
  failures: number;
  status: BreakerStatus;
  trippedAt: number | null;
}

export interface ToolBreakerSnapshot {
  name: string;
  status: BreakerStatus;
  failures: number;
  trippedAt: number | null;
}

export interface ToolBreakerOptions {
  /** 连续失败阈值（默认 TOOL_BREAKER_FAILURE_THRESHOLD=3） */
  threshold?: number;
  /** 冷却时长 ms（默认 TOOL_BREAKER_COOLDOWN_MS=5min） */
  cooldownMs?: number;
  /** 注入式时钟，便于测试 */
  now?: () => number;
}

export interface ToolBreaker {
  /** 是否处于熔断（应跳过执行）。cooldown 到期会自动转 half-open 并返回 false */
  isTripped(name: string): boolean;
  /** 记录一次执行结果：成功重置；失败累加或重新熔断 */
  recordResult(name: string, ok: boolean): void;
  /** 手动重置单个工具（管理面板用） */
  reset(name: string): void;
  /** 列出所有非 closed 工具快照 */
  listTripped(): ToolBreakerSnapshot[];
}

export function createToolBreaker(options: ToolBreakerOptions = {}): ToolBreaker {
  const threshold = options.threshold ?? TOOL_BREAKER_FAILURE_THRESHOLD;
  const cooldownMs = options.cooldownMs ?? TOOL_BREAKER_COOLDOWN_MS;
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, BreakerEntry>();

  function getEntry(name: string): BreakerEntry {
    let entry = entries.get(name);
    if (!entry) {
      entry = { failures: 0, status: 'closed', trippedAt: null };
      entries.set(name, entry);
    }
    return entry;
  }

  function isTripped(name: string): boolean {
    const entry = getEntry(name);
    if (entry.status === 'closed') return false;
    if (entry.status === 'half-open') return false;
    // open：检查 cooldown 是否到期，到期转 half-open 放行一次
    if (entry.trippedAt !== null && now() - entry.trippedAt >= cooldownMs) {
      entry.status = 'half-open';
      return false;
    }
    return true;
  }

  function recordResult(name: string, ok: boolean): void {
    const entry = getEntry(name);
    if (ok) {
      entry.failures = 0;
      entry.status = 'closed';
      entry.trippedAt = null;
      return;
    }
    if (entry.status === 'half-open') {
      // 半开失败：立即重新熔断并重新计时
      entry.failures = threshold;
      entry.status = 'open';
      entry.trippedAt = now();
      return;
    }
    entry.failures += 1;
    if (entry.failures >= threshold) {
      entry.status = 'open';
      entry.trippedAt = now();
    }
  }

  function reset(name: string): void {
    entries.delete(name);
  }

  function listTripped(): ToolBreakerSnapshot[] {
    const list: ToolBreakerSnapshot[] = [];
    for (const [name, entry] of entries) {
      if (entry.status !== 'closed') {
        list.push({
          name,
          status: entry.status,
          failures: entry.failures,
          trippedAt: entry.trippedAt,
        });
      }
    }
    return list;
  }

  return { isTripped, recordResult, reset, listTripped };
}
