import { createTaskRunRepository } from '@wbfm/database';
import { type TaskRunView } from '@wbfm/shared/schemas';
import type { ServiceDeps } from './deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import { runTaskLoop } from '../agent/task-loop';
import { createTaskLoopControl, type TaskLoopControl, type TaskLoopEvent, type TaskLoopParams } from '../agent/control';
import type { TaskPlanner } from '../agent/types';
import { createRunEventBus, type RunEventBus } from '../agents/run-event-bus';

/**
 * v2.8：任务运行改为服务端持有（server-owned job）。
 *
 * - 启动即后台消费 runTaskLoop；生成器生命周期不再绑定任何 SSE 请求；
 * - 页面 / 桌宠 / 舞台都是观察者，断开不 abort；只有 stop/pause/resume 与
 *   stopAll 能改变运行；
 * - 每帧先广播到总线再继续消费；观察者可用 since 续传（seq 1-based）；
 * - 运行终态后释放租约并回调 onComplete（完成回投幂等由调用方保证）。
 */

interface ActiveRun {
  control: TaskLoopControl;
  abort: AbortController;
  bus: RunEventBus<TaskLoopEvent>;
  done: Promise<void>;
  /** 当前已广播帧数（= seq 上界） */
  seq: number;
}

export interface TaskStartParams {
  /** 已在仓储创建（queued 状态）的运行记录 */
  run: TaskRunView;
  planner: TaskPlanner;
  allowedTools: string[];
  visionCapable: boolean;
  observeToolName?: string;
  /** v1.4 M2：知识注入与观察模式（协作 Executor 使用；桌面任务缺省即原行为） */
  knowledgeBaseIds?: string[];
  retrieve?: TaskLoopParams['retrieve'];
  observeMode?: 'screen' | 'tool';
}

export interface TaskRunnerService {
  /**
   * 启动后台作业并返回观察迭代器（含本场回放）。
   * 同一 runId 已活跃时直接返回观察迭代器（不重复启动、不抛 409）。
   */
  start(params: TaskStartParams): AsyncIterableIterator<TaskLoopEvent>;
  /** 只读观察（活跃返回总线迭代器；非活跃 null） */
  observe(runId: string, sinceSeq?: number): AsyncIterableIterator<TaskLoopEvent> | null;
  /** 等待运行结束（测试 / 完成回投用；非活跃立即 resolve） */
  awaitCompletion(runId: string): Promise<void>;
  stop(runId: string): boolean;
  pause(runId: string): boolean;
  resume(runId: string): boolean;
  stopAll(): number;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
}

export interface TaskRunnerDeps {
  ownerId?: string;
  /** v2.8：终端回调（完成回投；只调用一次） */
  onComplete?: (run: TaskRunView) => void;
}

const TERMINAL = new Set(['completed', 'failed', 'stopped']);

export function createTaskRunnerService(
  deps: ServiceDeps,
  runtime: ToolRuntime,
  onEvent?: (run: TaskRunView, event: TaskLoopEvent) => void,
  extra: TaskRunnerDeps = {},
): TaskRunnerService {
  const active = new Map<string, ActiveRun>();
  const repo = createTaskRunRepository(deps.db);
  const ownerId = extra.ownerId ?? 'process';

  /** 失败收敛：生成器抛错时保证不留下幽灵 running */
  const convergeFailure = (runId: string): void => {
    const latest = repo.getRun(runId);
    if (!latest || TERMINAL.has(latest.status)) return;
    const updated = repo.updateRunStatus(runId, 'failed', 'error');
    if (!updated) return;
    const event = {
      event: 'task',
      data: { type: 'run_finished', runId, conversationId: updated.conversationId, run: updated },
    } as TaskLoopEvent;
    onEvent?.(updated, event);
    const entry = active.get(runId);
    entry?.bus.publish(event);
  };

  const finish = (runId: string): void => {
    const entry = active.get(runId);
    if (!entry) return;
    entry.bus.close();
    active.delete(runId);
    repo.clearLease(runId);
    const latest = repo.getRun(runId);
    if (latest) {
      // v2.13 M3：运行生命周期审计（失败只告警，不阻断终态回投）
      deps.audit?.safeAppend({
        kind: 'run_finished',
        actor: 'agent',
        runId: latest.id,
        conversationId: latest.conversationId || null,
        policyHash: latest.policyHash,
        outcome: latest.stopReason ? `${latest.status}:${latest.stopReason}` : latest.status,
      });
      extra.onComplete?.(latest);
    }
  };

  return {
    start(params) {
      const existing = active.get(params.run.id);
      if (existing) return existing.bus.subscribe();
      const control = createTaskLoopControl();
      const abort = new AbortController();
      const bus = createRunEventBus<TaskLoopEvent>();
      const entry: ActiveRun = {
        control,
        abort,
        bus,
        seq: 0,
        done: Promise.resolve(),
      };
      active.set(params.run.id, entry);
      repo.setLease(
        params.run.id,
        ownerId,
        new Date(Date.now() + 90_000).toISOString(),
      );
      deps.audit?.safeAppend({
        kind: 'run_started',
        actor: 'agent',
        runId: params.run.id,
        conversationId: params.run.conversationId || null,
        policyHash: params.run.policyHash,
        outcome: `mode:${params.run.permissionMode}`,
      });
      const gen = runTaskLoop({
        deps,
        runtime,
        planner: params.planner,
        run: params.run,
        allowedTools: params.allowedTools,
        visionCapable: params.visionCapable,
        signal: abort.signal,
        control,
        ...(params.observeToolName ? { observeToolName: params.observeToolName } : {}),
        ...(params.knowledgeBaseIds !== undefined
          ? { knowledgeBaseIds: params.knowledgeBaseIds }
          : {}),
        ...(params.retrieve ? { retrieve: params.retrieve } : {}),
        ...(params.observeMode ? { observeMode: params.observeMode } : {}),
      });
      entry.done = (async () => {
        try {
          for (;;) {
            const step = await gen.next();
            if (step.done) break;
            entry.seq += 1;
            onEvent?.(params.run, step.value);
            bus.publish(step.value);
          }
        } catch {
          convergeFailure(params.run.id);
        } finally {
          finish(params.run.id);
        }
      })();
      return bus.subscribe();
    },

    observe(runId, sinceSeq) {
      const entry = active.get(runId);
      if (!entry) return null;
      return sinceSeq && sinceSeq > 1 ? entry.bus.subscribeFrom(sinceSeq) : entry.bus.subscribe();
    },

    awaitCompletion(runId) {
      return active.get(runId)?.done ?? Promise.resolve();
    },

    stop(runId) {
      const entry = active.get(runId);
      if (!entry) return false;
      entry.control.stop();
      entry.abort.abort();
      return true;
    },

    pause(runId) {
      const entry = active.get(runId);
      if (!entry) return false;
      entry.control.pause();
      return true;
    },

    resume(runId) {
      const entry = active.get(runId);
      if (!entry) return false;
      entry.control.resume();
      return true;
    },

    stopAll() {
      const count = active.size;
      for (const entry of active.values()) {
        entry.control.stop();
        entry.abort.abort();
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
