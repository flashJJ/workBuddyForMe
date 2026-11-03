import { describe, expect, it } from 'vitest';
import type { RunGraphScope, RunGraphSnapshot } from '@wbfm/shared/types';
import { projectRunGraph } from '@wbfm/core/session-log';
import type { RunGraphLiveFrame } from './live-bus';
import { applyRunGraphLiveFrame, applyRunGraphLiveFrames } from './append-event';

const BASE_AT = '2026-11-03T00:00:00.000Z';

function baseSnapshot(rootKind: 'conversation' | 'meeting', rootId: string): RunGraphSnapshot {
  const rootNodeId = `root:${rootKind}:${rootId}`;
  return {
    rootKind,
    rootId,
    generatedAt: BASE_AT,
    nodes: [
      {
        id: rootNodeId,
        kind: 'root',
        scope: rootKind === 'meeting' ? 'meeting' : 'chat',
        scopeId: rootId,
        laneId: `lane:root:${rootKind}:${rootId}`,
        parentId: null,
        status: 'unknown',
        label: '根',
        summary: rootId,
        at: BASE_AT,
        seq: 0,
        runId: null,
        errorCode: null,
      },
    ],
    edges: [],
    lanes: [
      {
        id: `lane:root:${rootKind}:${rootId}`,
        kind: rootKind === 'meeting' ? 'meeting' : 'conversation',
        name: rootKind === 'meeting' ? '会议' : '会话',
        colorToken: 'primary',
        parentLaneId: null,
        runId: null,
      },
    ],
    truncated: false,
  };
}

let seq = 0;

function frame(
  scope: RunGraphScope,
  scopeId: string,
  type: string,
  payload: unknown,
  at: string,
  root: { kind: 'conversation' | 'meeting'; id: string } = { kind: 'conversation', id: 'c1' },
): RunGraphLiveFrame {
  seq += 1;
  return {
    rootKind: root.kind,
    rootId: root.id,
    scope,
    scopeId,
    type,
    payload,
    at,
    receivedAt: at,
    seq,
  };
}

describe('v2.20 M3 实时追加 reducer', () => {
  it('chat 消息/工具/产物按身份更新，重复帧不重复建节点', () => {
    const snapshot = baseSnapshot('conversation', 'c1');
    const frames = [
      frame('chat', 'c1', 'message_started', { messageId: 'a1', role: 'assistant', content: '', status: 'streaming' }, '2026-11-03T00:00:01.000Z'),
      frame(
        'chat',
        'c1',
        'tool_trace',
        {
          messageId: 'a1',
          trace: [
            {
              callId: 'call1',
              tool: 'artifact_write',
              status: 'running',
              argsSummary: 'write',
              resultSummary: '',
              startedAt: '2026-11-03T00:00:02.000Z',
            },
          ],
        },
        '2026-11-03T00:00:02.000Z',
      ),
      frame(
        'chat',
        'c1',
        'tool_trace',
        {
          messageId: 'a1',
          trace: [
            {
              callId: 'call1',
              tool: 'artifact_write',
              status: 'ok',
              argsSummary: 'write',
              resultSummary: 'saved',
              startedAt: '2026-11-03T00:00:02.000Z',
              artifacts: [
                {
                  attachmentId: 'att1',
                  title: '报告',
                  filename: 'report.md',
                  format: 'markdown',
                  mimeType: 'text/markdown',
                  byteSize: 128,
                },
              ],
            },
          ],
        },
        '2026-11-03T00:00:03.000Z',
      ),
      frame('chat', 'c1', 'message_completed', { messageId: 'a1', content: '报告完成' }, '2026-11-03T00:00:04.000Z'),
      frame('chat', 'c1', 'message_started', { messageId: 'a1', role: 'assistant', status: 'streaming' }, '2026-11-03T00:00:05.000Z'),
    ];

    const graph = applyRunGraphLiveFrames(snapshot, frames);
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toContain('chat:c1:message:a1');
    expect(ids).toContain('chat:c1:tool:call1');
    expect(ids).toContain('artifact:att1');
    expect(graph.nodes.find((node) => node.id === 'chat:c1:message:a1')?.status).toBe('succeeded');
    expect(graph.nodes.find((node) => node.id === 'chat:c1:tool:call1')?.status).toBe('succeeded');
    expect(graph.edges.some((edge) => edge.kind === 'node_to_artifact')).toBe(true);
  });

  it('终态节点不被迟到的 running 帧回退', () => {
    const snapshot = baseSnapshot('conversation', 'c1');
    const completed = applyRunGraphLiveFrame(
      snapshot,
      frame('chat', 'c1', 'message_completed', { messageId: 'a1', content: 'done' }, '2026-11-03T00:00:02.000Z'),
    );
    const late = applyRunGraphLiveFrame(
      completed,
      frame('chat', 'c1', 'message_started', { messageId: 'a1', role: 'assistant', status: 'streaming' }, '2026-11-03T00:00:03.000Z'),
    );
    expect(late.nodes.find((node) => node.id === 'chat:c1:message:a1')?.status).toBe('succeeded');
  });

  it('agent 帧生成运行/轮次/交接/审查节点', () => {
    const snapshot = baseSnapshot('conversation', 'c1');
    const frames = [
      frame('agent', 'r1', 'run_started', { runId: 'r1' }, '2026-11-03T00:00:01.000Z'),
      frame('agent', 'r1', 'agent_phase', { runId: 'r1', phase: 'planning', role: 'planner', round: 0 }, '2026-11-03T00:00:02.000Z'),
      frame(
        'agent',
        'r1',
        'agent_handoff',
        {
          runId: 'r1',
          handoff: {
            id: 'h1',
            roundNo: 0,
            fromRole: 'planner',
            toRole: 'executor',
            payload: { subtask: '整理文件' },
          },
        },
        '2026-11-03T00:00:03.000Z',
      ),
      frame('agent', 'r1', 'agent_review', { runId: 'r1', round: 0, review: { verdict: 'approve' } }, '2026-11-03T00:00:04.000Z'),
      frame('agent', 'r1', 'done', { runId: 'r1', content: '完成' }, '2026-11-03T00:00:05.000Z'),
    ];

    const graph = applyRunGraphLiveFrames(snapshot, frames);
    expect(graph.nodes.map((node) => node.id)).toContain('run:agent:r1');
    expect(graph.nodes.map((node) => node.id)).toContain('agent:r1:round:0:planner');
    expect(graph.nodes.map((node) => node.id)).toContain('agent:r1:handoff:h1');
    expect(graph.nodes.map((node) => node.id)).toContain('agent:r1:review:0');
    expect(graph.nodes.find((node) => node.id === 'run:agent:r1')?.status).toBe('succeeded');
    expect(graph.lanes.some((lane) => lane.kind === 'role')).toBe(true);
  });

  it('meeting 轮次按 turnIndex 建节点，消息挂到最近轮次', () => {
    const snapshot = baseSnapshot('meeting', 'm1');
    const frames = [
      frame(
        'meeting',
        'm1',
        'meeting_turn_start',
        { meetingId: 'm1', mode: 'manual', speakerIds: ['a1'], autoRounds: 0, turnIndex: 0 },
        '2026-11-03T00:00:01.000Z',
        { kind: 'meeting', id: 'm1' },
      ),
      frame(
        'meeting',
        'm1',
        'meeting_message',
        { meetingId: 'm1', message: { id: 'msg1', speakerName: '助手 A', content: '你好' } },
        '2026-11-03T00:00:02.000Z',
        { kind: 'meeting', id: 'm1' },
      ),
    ];

    const graph = applyRunGraphLiveFrames(snapshot, frames);
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:turn:0');
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:message:msg1');
    expect(graph.edges.some((edge) => edge.kind === 'turn_to_message')).toBe(true);
  });

  it('历史基线之前的帧不补演', () => {
    const snapshot = baseSnapshot('conversation', 'c1');
    const oldFrame = frame('chat', 'c1', 'message_started', { messageId: 'old' }, '2026-11-02T23:59:59.000Z');
    const graph = applyRunGraphLiveFrames(snapshot, [oldFrame]);
    expect(graph.nodes.map((node) => node.id)).not.toContain('chat:c1:message:old');
  });

  it('与 core 投影生成相同的节点身份与终态', () => {
    const snapshot = baseSnapshot('conversation', 'c1');
    const events = [
      { id: 'e1', scope: 'chat' as const, scopeId: 'c1', seq: 1, type: 'message_started', payload: { messageId: 'a1', role: 'assistant', status: 'streaming' }, schemaVersion: 1, createdAt: '2026-11-03T00:00:01.000Z' },
      { id: 'e2', scope: 'chat' as const, scopeId: 'c1', seq: 2, type: 'tool_trace', payload: { messageId: 'a1', trace: [{ callId: 'call1', tool: 'file_list', status: 'ok', argsSummary: 'ls', resultSummary: 'ok' }] }, schemaVersion: 1, createdAt: '2026-11-03T00:00:02.000Z' },
      { id: 'e3', scope: 'chat' as const, scopeId: 'c1', seq: 3, type: 'message_completed', payload: { messageId: 'a1', content: '完成' }, schemaVersion: 1, createdAt: '2026-11-03T00:00:03.000Z' },
      { id: 'e4', scope: 'agent' as const, scopeId: 'r1', seq: 1, type: 'agent_phase', payload: { runId: 'r1', phase: 'planning', role: 'planner', round: 0 }, schemaVersion: 1, createdAt: '2026-11-03T00:00:04.000Z' },
      { id: 'e5', scope: 'agent' as const, scopeId: 'r1', seq: 2, type: 'done', payload: { runId: 'r1', content: '完成' }, schemaVersion: 1, createdAt: '2026-11-03T00:00:05.000Z' },
    ];
    const frames = events.map((event) =>
      frame(event.scope, event.scopeId, event.type, event.payload, event.createdAt),
    );

    const live = applyRunGraphLiveFrames(snapshot, frames);
    const projected = projectRunGraph({
      rootKind: 'conversation',
      rootId: 'c1',
      events,
      generatedAt: '2026-11-03T00:00:10.000Z',
    });
    const signatures = (graph: RunGraphSnapshot) =>
      graph.nodes.map((node) => `${node.id}:${node.status}`).sort();
    expect(signatures(live)).toEqual(signatures(projected));
  });
});
