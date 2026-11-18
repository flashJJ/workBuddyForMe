import type { CondensationTrigger } from '@wbfm/shared/schemas';
import type { SessionLogService } from '../../session-log/session-log-service';

/**
 * v4.8 预判压缩触发归因：
 * 最近一次装配窗口大于当前模型窗口 → model_change；其余 → preflight。
 * 只在即将压缩时调用，避免每轮额外读事件。
 */
export function resolvePreflightTrigger(
  events: SessionLogService | undefined,
  conversationId: string,
  currentWindow: number,
): CondensationTrigger {
  if (!events) return 'preflight';
  try {
    const latest = events
      .listAll({ scope: 'chat', scopeId: conversationId, limit: 20 })
      .find((event) => event.type === 'context_snapshot');
    const previous = (latest?.payload as { contextWindow?: unknown } | null)?.contextWindow;
    if (typeof previous === 'number' && previous > currentWindow) return 'model_change';
  } catch {
    // 事件读取失败不影响压缩本身
  }
  return 'preflight';
}
