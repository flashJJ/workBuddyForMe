/**
 * v2.20 RunGraph：session_events → 节点/边/车道的只读投影。
 * 纯函数：不查库、不读 UI 状态；同一份事件多次调用结果稳定。
 */
import type { SessionEventView } from '@wbfm/database';
import type {
  RunGraphRootKind,
  RunGraphScope,
  RunGraphSnapshot,
} from '@wbfm/shared/types';
import { createBuilder, finalizeGraph } from './builder';
import { applyChat } from './chat';
import { applyTask } from './task';
import { applyFlow } from './flow';
import { applyAgentEvent } from './agent';
import { applyMeeting } from './meeting';
import { applyBranch } from './branch';
import { field, text } from './payload';

export interface RunGraphProjectionInput {
  rootKind: RunGraphRootKind;
  rootId: string;
  events: readonly SessionEventView[];
  /** 默认 500，范围 1–1000 */
  limit?: number;
  /** 测试/API 快照时间；缺省用当前时间 */
  generatedAt?: string;
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const SCOPE_ORDER: Record<RunGraphScope, number> = {
  chat: 0,
  task: 1,
  flow: 2,
  agent: 3,
  meeting: 4,
  branch: 5,
};

export function projectRunGraph(input: RunGraphProjectionInput): RunGraphSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const limit = clampLimit(input.limit);
  const events = input.events
    .filter((event) => matchesRoot(event, input.rootKind, input.rootId))
    .slice()
    .sort(compareEvents);

  const builder = createBuilder(input.rootKind, input.rootId, events[0]?.createdAt ?? generatedAt);
  for (const event of events) applyEvent(builder, event);
  return finalizeGraph(builder, limit, generatedAt);
}

function applyEvent(b: ReturnType<typeof createBuilder>, event: SessionEventView): void {
  switch (event.scope) {
    case 'chat':
      applyChat(b, event);
      return;
    case 'task':
      applyTask(b, event);
      return;
    case 'flow':
      applyFlow(b, event);
      return;
    case 'agent':
      applyAgentEvent(b, event.scopeId, event.type, event.payload, b.rootNodeId, b.rootLaneId, event.createdAt, event.seq);
      return;
    case 'meeting':
      applyMeeting(b, event);
      return;
    case 'branch':
      applyBranch(b, event);
      return;
    default:
      return;
  }
}

function compareEvents(a: SessionEventView, b: SessionEventView): number {
  return (
    a.createdAt.localeCompare(b.createdAt) ||
    SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
    a.seq - b.seq ||
    a.id.localeCompare(b.id)
  );
}

function matchesRoot(event: SessionEventView, kind: RunGraphRootKind, id: string): boolean {
  if (kind === 'meeting') return event.scope === 'meeting' && event.scopeId === id;
  if (event.scope === 'meeting') return false;
  if (event.scope === 'chat') return event.scopeId === id;
  if (event.scope === 'branch') {
    const parent = text(field(event.payload, 'parentConversationId'));
    return parent ? parent === id : true;
  }
  return true;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}
