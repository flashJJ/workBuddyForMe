/**
 * v2.20 M3：SSE 帧 → RunGraph 快照的纯函数追加。
 *
 * 分 scope 实现与 core 投影的节点身份一致；快照是权威，
 * 已终态节点不被迟到帧回退；历史帧按 generatedAt 基线过滤。
 */
import type { RunGraphNode, RunGraphScope, RunGraphSnapshot } from '@wbfm/shared/types';
import type { RunGraphLiveFrame } from './live-bus';
import { type Draft } from './append-context';
import { applyChatFrame } from './append-chat';
import { applyAgentFrame } from './append-agent';
import { applyMeetingFrame } from './append-meeting';

const DEFAULT_LIMIT = 500;
const SCOPE_ORDER: Record<RunGraphScope, number> = { chat: 0, task: 1, flow: 2, agent: 3, meeting: 4 };

function compareNodes(a: RunGraphNode, b: RunGraphNode): number {
  return (
    a.at.localeCompare(b.at) ||
    SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
    a.seq - b.seq ||
    a.id.localeCompare(b.id)
  );
}

function createDraft(snapshot: RunGraphSnapshot): Draft {
  const rootNodeId = `root:${snapshot.rootKind}:${snapshot.rootId}`;
  const rootLaneId = `lane:root:${snapshot.rootKind}:${snapshot.rootId}`;
  const lastTurn = snapshot.nodes.filter((node) => node.kind === 'meeting_turn').at(-1)?.id ?? null;
  return {
    snapshot,
    nodes: new Map(snapshot.nodes.map((node) => [node.id, node])),
    edges: new Map(snapshot.edges.map((edge) => [edge.id, edge])),
    lanes: new Map(snapshot.lanes.map((lane) => [lane.id, lane])),
    rootNodeId,
    rootLaneId,
    lastMeetingTurnNodeId: lastTurn,
  };
}

function finalize(draft: Draft, limit: number): RunGraphSnapshot {
  const sorted = [...draft.nodes.values()].sort(compareNodes);
  const root = sorted.find((node) => node.id === draft.rootNodeId);
  const others = sorted.filter((node) => node.id !== draft.rootNodeId);
  const keepCount = Math.max(0, limit - 1);
  const truncated = draft.snapshot.truncated || others.length > keepCount;
  const kept = truncated ? (keepCount === 0 ? [] : others.slice(-keepCount)) : others;
  const nodes = root ? [root, ...kept] : kept;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [...draft.edges.values()].filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  return {
    ...draft.snapshot,
    nodes,
    edges,
    lanes: [...draft.lanes.values()],
    truncated,
  };
}

/** 单帧追加；返回新快照，不修改入参 */
export function applyRunGraphLiveFrame(
  snapshot: RunGraphSnapshot,
  frame: RunGraphLiveFrame,
  limit = DEFAULT_LIMIT,
): RunGraphSnapshot {
  const draft = createDraft(snapshot);
  switch (frame.scope) {
    case 'chat':
      applyChatFrame(draft, frame);
      break;
    case 'agent':
      applyAgentFrame(draft, frame);
      break;
    case 'meeting':
      applyMeetingFrame(draft, frame);
      break;
    default:
      break;
  }
  return finalize(draft, Math.min(1000, Math.max(1, Math.floor(limit))));
}

/** 以快照 generatedAt 为历史基线，只追加基线之后收到的帧 */
export function applyRunGraphLiveFrames(
  snapshot: RunGraphSnapshot,
  frames: readonly RunGraphLiveFrame[],
  limit = DEFAULT_LIMIT,
): RunGraphSnapshot {
  return frames
    .filter((frame) => frame.receivedAt > snapshot.generatedAt)
    .reduce((current, frame) => applyRunGraphLiveFrame(current, frame, limit), snapshot);
}
