import { createTaskRunRepository } from '@wbfm/database';
import { createScheduledAgentRunner } from '@wbfm/core/scheduler';
import type { ScheduledTaskView } from '@wbfm/shared/schemas';
import type { ServiceContainer } from './container';
import { resolveTaskLaunchArtifacts } from './task-launcher';

/**
 * v2.13 M4：服务端定时 Agent 启动接线。
 * 运行创建与治理校验在 core（可单测）；这里只注入仓储、任务启动器与模型解析。
 */
export function startScheduledAgentTask(
  services: ServiceContainer,
  task: ScheduledTaskView,
  scheduledAt: string,
) {
  const settings = services.settings.get();
  const runner = createScheduledAgentRunner({
    repo: createTaskRunRepository(services.db),
    starter: services.taskRunner,
    launch: (run) => resolveTaskLaunchArtifacts(services, run),
    policy: settings.agentPolicy,
    audit: services.audit,
  });
  return runner.start({ task, scheduledAt });
}
