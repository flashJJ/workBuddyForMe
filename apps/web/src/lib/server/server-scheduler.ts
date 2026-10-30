import { runSchedulerTick } from '@wbfm/core/scheduler';
import { isScheduledAgentTask } from '@wbfm/shared/schemas';
import type { ServiceContainer } from './container';
import { startScheduledAgentTask } from './scheduled-agent';

/**
 * v2.13 M4：服务端常驻调度（10s，单进程单例）。
 * - 只接管 agent_task；普通提醒 / follow_up 仍由渲染进程 tick 投递，避免双端抢标记导致丢失；
 * - 保留关系检查点与里程碑扫描副作用，避免行为回退；
 * - 进程退出即停止，不做开机自启 / 系统服务。
 */

const INTERVAL_MS = 10_000;
const HOLDER_KEY = '__WBFM_SERVER_SCHEDULER__';

interface SchedulerHolder {
  [HOLDER_KEY]?: ReturnType<typeof setInterval>;
}

export async function runServerSchedulerTick(services: ServiceContainer): Promise<number> {
  services.orchestrator.runRelationshipCheckpoint();
  services.relationshipMilestones.evaluateAll();
  return runSchedulerTick({
    listDue: (nowMs) =>
      services.schedules.listDue(nowMs).filter((task) => isScheduledAgentTask(task.payload)),
    markFired: (id, nowMs) => services.schedules.markFired(id, nowMs),
    deliver: (due) => {
      const task = services.schedules.get(due.id);
      startScheduledAgentTask(services, task, due.scheduledAt);
    },
    onWarn: (code, detail) => console.warn(`[scheduler] ${code}`, detail),
  });
}

/** 启动服务端调度；globalThis 防 Next 热重载重复注册 */
export function ensureServerScheduler(services: ServiceContainer): void {
  const holder = globalThis as SchedulerHolder;
  if (holder[HOLDER_KEY]) return;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runServerSchedulerTick(services).finally(() => {
      running = false;
    });
  }, INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  holder[HOLDER_KEY] = timer;
}
