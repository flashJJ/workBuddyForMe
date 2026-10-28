import {
  createAgentRunRepository,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';

/**
 * v2.8：服务重启恢复。进程内 job 全部丢失，DB 中的非终态运行不能保留为
 * running/queued 幽灵；统一收敛为 interrupted（不伪造成功）。
 * 幂等：只处理非终态行，重复调用无副作用。
 */
export function recoverInterruptedRunJobs(db: DatabaseInstance): {
  tasks: number;
  agents: number;
} {
  const taskRepo = createTaskRunRepository(db);
  const agentRepo = createAgentRunRepository(db);
  let tasks = 0;
  let agents = 0;

  for (const run of taskRepo.listNonTerminalRuns()) {
    const updated = taskRepo.updateRunStatus(run.id, 'stopped', 'interrupted');
    taskRepo.clearLease(run.id);
    if (updated) tasks += 1;
  }

  for (const run of agentRepo.listRunning()) {
    agentRepo.finalize(run.id, {
      status: 'cancelled',
      errorCode: 'INTERRUPTED',
      errorMessage: '应用重启，运行中断',
    });
    agentRepo.clearLease(run.id);
    agents += 1;
  }

  return { tasks, agents };
}

/** 路由发现运行非活跃但仍 running/paused（容器重载竞态）时收敛单条 */
export function convergeOrphanTaskRun(
  db: DatabaseInstance,
  runId: string,
): boolean {
  const repo = createTaskRunRepository(db);
  const run = repo.getRun(runId);
  if (!run) return false;
  if (run.status !== 'running' && run.status !== 'paused' && run.status !== 'queued') {
    return false;
  }
  const updated = repo.updateRunStatus(runId, 'stopped', 'interrupted');
  repo.clearLease(runId);
  return Boolean(updated);
}
