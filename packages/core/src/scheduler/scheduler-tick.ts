/**
 * v1.7 调度 tick（纯编排，不直接访问 DB；见 docs/plan/v1.7/03 §4）。
 *
 * 幂等口径：先标记后投递——listDue → 逐条 markFired（事务内推进 next_run_at），
 * 全部标记成功后再把到期项交给投递回调；回调失败（无窗/通知失败）不回滚时刻，
 * 避免同一提醒重复打扰（错过即跳过，与手机日历一致）。
 */
import type { ScheduledTaskView } from '@wbfm/shared/schemas';

export interface DueTask {
  id: string;
  assistantId: string;
  text: string;
  kind: ScheduledTaskView['kind'];
  /** 预定触发时刻（UTC ISO） */
  scheduledAt: string;
}

export interface SchedulerTickDeps {
  /** 列出 enabled 且 next_run_at <= now 的提醒（仓储注入） */
  listDue: (nowMs: number) => ScheduledTaskView[];
  /** 触发后推进：once 停用，daily/weekly 重算；返回更新后视图（测试可替身） */
  markFired: (id: string, nowMs: number) => ScheduledTaskView | null;
  /** 投递（演出/通知兜底）；抛错只告警不影响其余到期项 */
  deliver: (task: DueTask) => void | Promise<void>;
  now?: () => number;
  /** 单条标记/投递异常的结构化日志 */
  onWarn?: (code: string, detail?: unknown) => void;
}

/**
 * 执行一次 tick。web 会话存活期以 setInterval(10s) 驱动（与 proactive 心跳同粒度）。
 * @returns 本次投递的到期项数
 */
export async function runSchedulerTick(deps: SchedulerTickDeps): Promise<number> {
  const now = (deps.now ?? Date.now)();
  const due = deps.listDue(now);
  if (due.length === 0) return 0;

  // 阶段 1：先标记（任一失败则该条本轮不投递，等下轮重新到点判定）
  const accepted: DueTask[] = [];
  for (const task of due) {
    try {
      const updated = deps.markFired(task.id, now);
      if (!updated) continue;
      accepted.push({
        id: task.id,
        assistantId: task.assistantId,
        text: task.text,
        kind: task.kind,
        scheduledAt: task.nextRunAt,
      });
    } catch (error) {
      deps.onWarn?.('scheduler.markFiredFailed', { id: task.id, error });
    }
  }

  // 阶段 2：投递（互不阻塞；异常隔离）
  await Promise.all(
    accepted.map(async (task) => {
      try {
        await deps.deliver(task);
      } catch (error) {
        deps.onWarn?.('scheduler.deliverFailed', { id: task.id, error });
      }
    }),
  );

  return accepted.length;
}

/** 工厂形式：返回可直接传给 setInterval 的 tick 函数（异常不外泄，心跳不被打断） */
export function createSchedulerTick(deps: SchedulerTickDeps): () => Promise<number> {
  return () =>
    runSchedulerTick(deps).catch((error) => {
      deps.onWarn?.('scheduler.tickFailed', error);
      return 0;
    });
}
