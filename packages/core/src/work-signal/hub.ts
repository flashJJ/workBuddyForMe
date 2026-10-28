import type {
  AgentRunView,
  FlowEventPayload,
  TaskEventPayload,
  TaskRunView,
  WorkflowRunView,
  WorkSignal,
  WorkSignalSnapshot,
} from '@wbfm/shared';
import { pruneWorkSignals, sortWorkSignals } from '@wbfm/shared';
import { createRunEventBus, type RunEventBus } from '../agents/run-event-bus';
import type { AgentRunEvent } from '../agents/agent-runner';
import type { ApprovalRegistry } from './approval-registry';
import { applyAgentEvent } from './map-agent';
import { applyFlowEvent } from './map-flow';
import { applyTaskEvent } from './map-task';

export interface WorkSignalHub {
  /** taskRunner 事件回调（非 task 事件自动忽略） */
  ingestTask(run: TaskRunView, event: { event: string; data: unknown }): void;
  ingestFlow(run: WorkflowRunView, event: FlowEventPayload, title: string): void;
  ingestAgent(run: AgentRunView, event: AgentRunEvent): void;
  snapshot(): WorkSignalSnapshot;
  /** 订阅后续快照；调用方先发送 snapshot() 作为首帧 */
  subscribe(): AsyncIterable<WorkSignalSnapshot>;
  clear(): void;
}

export interface WorkSignalHubDeps {
  approvals: ApprovalRegistry;
}

const CLEANUP_INTERVAL_MS = 15_000;
const SNAPSHOT_BUFFER = 50;

/**
 * v2.7 运行工作信号 hub：
 * - 只存进程内最新信号，不落库（v2.9 事件日志另做）；
 * - 终态信号保留 60 秒供桌宠脉冲，定时清理；
 * - 审批变化也触发快照，桌宠与审批页共用同一 SSE。
 */
export function createWorkSignalHub({ approvals }: WorkSignalHubDeps): WorkSignalHub {
  let signals = new Map<string, WorkSignal>();
  let seq = 0;
  const bus: RunEventBus<WorkSignalSnapshot> = createRunEventBus({ maxBuffer: SNAPSHOT_BUFFER });

  const buildSnapshot = (): WorkSignalSnapshot => ({
    seq,
    generatedAt: new Date().toISOString(),
    signals: sortWorkSignals([...signals.values()], approvals.list()),
    approvals: approvals.list(),
  });

  const emit = () => {
    seq += 1;
    bus.publish(buildSnapshot());
  };

  const upsert = (next: WorkSignal | null) => {
    if (!next) return;
    signals.set(next.key, next);
    emit();
  };

  approvals.subscribe(emit);
  const timer = setInterval(() => {
    const pruned = pruneWorkSignals([...signals.values()]);
    if (pruned.length === signals.size) return;
    signals = new Map(pruned.map((signal) => [signal.key, signal]));
    emit();
  }, CLEANUP_INTERVAL_MS);
  timer.unref?.();

  return {
    ingestTask(run, event) {
      if (event.event !== 'task') return;
      upsert(applyTaskEvent(signals.get(`task:${run.id}`), run, event.data as TaskEventPayload));
    },

    ingestFlow(run, event, title) {
      upsert(applyFlowEvent(signals.get(`flow:${run.id}`), run, event, title));
    },

    ingestAgent(run, event) {
      upsert(applyAgentEvent(signals.get(`agent:${run.id}`), run, event));
    },

    snapshot: buildSnapshot,
    subscribe: () => bus.subscribeLive(),
    clear() {
      signals.clear();
      approvals.clear();
      emit();
    },
  };
}

export type { WorkSignal, WorkSignalSnapshot };
