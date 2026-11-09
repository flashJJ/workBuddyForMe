import { runSchedulerTick } from '@wbfm/core/scheduler';
import { MEMORY_EVENT_RETENTION_DEFAULT_DAYS, MEMORY_CONSOLIDATE_INTERVAL_MS } from '@wbfm/shared/constants';
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
const ROLLUP_HOLDER_KEY = '__WBFM_MEMORY_EVENT_ROLLUP__';
const ROLLUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONSOLIDATE_HOLDER_KEY = '__WBFM_MEMORY_CONSOLIDATE__';

interface SchedulerHolder {
  [HOLDER_KEY]?: ReturnType<typeof setInterval>;
  [ROLLUP_HOLDER_KEY]?: ReturnType<typeof setInterval>;
  [CONSOLIDATE_HOLDER_KEY]?: ReturnType<typeof setInterval>;
}

/**
 * v2.28 P1：记忆审计轮转（启动后异步一次 + 每 24h，单飞）。
 * 保留期读现有 settings；失败只告警，不阻塞启动与接口。
 */
function runMemoryEventRollupTick(services: ServiceContainer): void {
  try {
    const retentionDays =
      services.settings.get().memoryEventRetentionDays ?? MEMORY_EVENT_RETENTION_DEFAULT_DAYS;
    services.memories.runEventRollup({ retentionDays });
  } catch (error) {
    console.warn('[memory] 审计轮转失败', error);
  }
}

function ensureMemoryEventRollup(services: ServiceContainer, holder: SchedulerHolder): void {
  if (holder[ROLLUP_HOLDER_KEY]) return;
  const boot = setTimeout(() => runMemoryEventRollupTick(services), 0);
  (boot as { unref?: () => void }).unref?.();
  const timer = setInterval(() => runMemoryEventRollupTick(services), ROLLUP_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  holder[ROLLUP_HOLDER_KEY] = timer;
}

/**
 * v2.31 P1：记忆空闲整理（启动后异步一次 + 每 24h，单飞）。
 * 距上次整理不足 24h 时跳过，避免频繁重启反复扫描；失败只告警。
 */
function runMemoryConsolidateTick(services: ServiceContainer): void {
  try {
    const last = services.memories.getStats().lastConsolidate?.at;
    if (last && Date.now() - Date.parse(last) < MEMORY_CONSOLIDATE_INTERVAL_MS) return;
    const summary = services.memories.consolidate();
    if (summary.archived + summary.mergedSubjects + summary.edgesRemoved > 0) {
      console.info(
        `[memory] 整理完成：扫描 ${summary.scanned}，归档 ${summary.archived}，合并主体 ${summary.mergedSubjects}，清理边 ${summary.edgesRemoved}`,
      );
    }
  } catch (error) {
    console.warn('[memory] 整理失败', error);
  }
}

function ensureMemoryConsolidate(services: ServiceContainer, holder: SchedulerHolder): void {
  if (holder[CONSOLIDATE_HOLDER_KEY]) return;
  const boot = setTimeout(() => runMemoryConsolidateTick(services), 0);
  (boot as { unref?: () => void }).unref?.();
  const timer = setInterval(() => runMemoryConsolidateTick(services), MEMORY_CONSOLIDATE_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  holder[CONSOLIDATE_HOLDER_KEY] = timer;
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
  ensureMemoryEventRollup(services, holder);
  ensureMemoryConsolidate(services, holder);
}
