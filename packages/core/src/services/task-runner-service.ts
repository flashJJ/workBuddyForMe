import type { TaskRunView } from '@wbfm/shared';
import type { ServiceDeps } from './deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import { runTaskLoop } from '../agent/task-loop';
import { createTaskLoopControl, type TaskLoopControl, type TaskLoopEvent } from '../agent/control';
import type { TaskPlanner } from '../agent/types';

/**
 * v0.7 M3-4 任务运行管理服务：
 * 把 core 的 runTaskLoop（async generator）包装为可外部控制（stop/pause/resume）的服务，
 * 维护 in-memory Map<runId, {control, abort}>，急停热键经 stopAll 一次性中断全部活跃运行。
 * 客户端断线 → clientSignal 联动 abort；服务自身 abort 与 clientSignal 合并后注入循环。
 */

interface ActiveRun {
  control: TaskLoopControl;
  abort: AbortController;
}

export interface TaskStartParams {
  /** 已在仓储创建（queued 状态）的运行记录 */
  run: TaskRunView;
  planner: TaskPlanner;
  allowedTools: string[];
  visionCapable: boolean;
  /** 客户端请求信号（断线联动）；缺省仅服务自身 abort 控制 */
  clientSignal?: AbortSignal;
  observeToolName?: string;
}

export interface TaskRunnerService {
  /** 启动循环：返回事件生成器（消费完自动从注册表移除） */
  start(params: TaskStartParams): AsyncGenerator<TaskLoopEvent, TaskRunView>;
  /** 急停单个任务（control.stop + abort）；不存在返回 false */
  stop(runId: string): boolean;
  /** 暂停 */
  pause(runId: string): boolean;
  /** 继续 */
  resume(runId: string): boolean;
  /** 急停全部活跃任务（急停热键触发）；返回中断数量 */
  stopAll(): number;
  /** 活跃判定（急停后立即 false） */
  isActive(runId: string): boolean;
  /** 当前活跃任务 id 快照（测试/面板用） */
  activeRunIds(): string[];
}

export function createTaskRunnerService(deps: ServiceDeps, runtime: ToolRuntime): TaskRunnerService {
  const active = new Map<string, ActiveRun>();

  return {
    start(params) {
      const control = createTaskLoopControl();
      const abort = new AbortController();
      const combined = params.clientSignal
        ? AbortSignal.any([params.clientSignal, abort.signal])
        : abort.signal;
      active.set(params.run.id, { control, abort });
      const gen = runTaskLoop({
        deps,
        runtime,
        planner: params.planner,
        run: params.run,
        allowedTools: params.allowedTools,
        visionCapable: params.visionCapable,
        signal: combined,
        control,
        ...(params.observeToolName ? { observeToolName: params.observeToolName } : {}),
      });
      // 包装：消费完（return/throw/break）从注册表移除
      return (async function* () {
        try {
          return yield* gen;
        } finally {
          active.delete(params.run.id);
        }
      })();
    },
    stop(runId) {
      const a = active.get(runId);
      if (!a) return false;
      a.control.stop();
      a.abort.abort();
      return true;
    },
    pause(runId) {
      const a = active.get(runId);
      if (!a) return false;
      a.control.pause();
      return true;
    },
    resume(runId) {
      const a = active.get(runId);
      if (!a) return false;
      a.control.resume();
      return true;
    },
    stopAll() {
      const count = active.size;
      for (const a of active.values()) {
        a.control.stop();
        a.abort.abort();
      }
      return count;
    },
    isActive(runId) {
      return active.has(runId);
    },
    activeRunIds() {
      return [...active.keys()];
    },
  };
}
