import { describe, expect, it } from 'vitest';
import type { SessionEventView } from '@wbfm/database';
import type { RunGraphRootKind, RunGraphScope } from '@wbfm/shared/types';
import { projectRunGraph } from './project';

function ev(
  scope: RunGraphScope,
  scopeId: string,
  type: string,
  payload: unknown,
  seq: number,
  at = `2026-11-03T00:00:0${seq}.000Z`,
): SessionEventView {
  return { id: `e${seq}`, scope, scopeId, seq, type, payload, schemaVersion: 1, createdAt: at };
}

function project(
  rootKind: RunGraphRootKind,
  rootId: string,
  events: SessionEventView[],
  limit?: number,
) {
  return projectRunGraph({
    rootKind,
    rootId,
    events,
    limit,
    generatedAt: '2026-11-03T00:00:10.000Z',
  });
}

describe('v2.20 RunGraph 投影', () => {
  it('chat：消息、工具、产物共用根节点，重复事件去重', () => {
    const artifact = {
      attachmentId: 'att1',
      title: '报告',
      filename: 'report.md',
      format: 'markdown',
      mimeType: 'text/markdown',
      byteSize: 128,
    };
    const events = [
      ev('chat', 'c1', 'message_started', { messageId: 'u1', role: 'user', content: '做一份报告' }, 1),
      ev('chat', 'c1', 'message_started', { messageId: 'a1', role: 'assistant', content: '', status: 'streaming' }, 2),
      ev(
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
              durationMs: 1,
              startedAt: '2026-11-03T00:00:02.000Z',
              artifacts: [artifact],
            },
          ],
        },
        3,
      ),
      ev('chat', 'c1', 'message_completed', { messageId: 'a1', content: '报告完成' }, 4),
      ev('chat', 'c1', 'message_completed', { messageId: 'a1', content: '报告完成' }, 4),
    ];

    const graph = project('conversation', 'c1', events);
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toContain('root:conversation:c1');
    expect(ids).toContain('chat:c1:message:u1');
    expect(ids).toContain('chat:c1:message:a1');
    expect(ids).toContain('chat:c1:tool:call1');
    expect(ids).toContain('artifact:att1');
    expect(ids.filter((id) => id === 'chat:c1:message:a1')).toHaveLength(1);
    expect(graph.nodes.find((node) => node.id === 'chat:c1:message:a1')?.status).toBe('succeeded');
    expect(graph.nodes.find((node) => node.id === 'chat:c1:tool:call1')?.status).toBe('succeeded');
    expect(graph.nodes.find((node) => node.id === 'artifact:att1')?.artifact?.attachmentId).toBe('att1');
    expect(graph.edges.some((edge) => edge.kind === 'node_to_artifact')).toBe(true);
  });

  it('task：run/step 状态沿事件推进，终态收敛', () => {
    const events = [
      ev('task', 'r1', 'run_started', { runId: 'r1', run: { goal: '整理文件' } }, 1),
      ev(
        'task',
        'r1',
        'step_started',
        { runId: 'r1', step: { id: 's1', kind: 'action', toolName: 'file_list', status: 'running', reason: '先看目录' } },
        2,
      ),
      ev(
        'task',
        'r1',
        'step_finished',
        { runId: 'r1', step: { id: 's1', kind: 'action', toolName: 'file_list', status: 'completed', resultJson: 'ok' } },
        3,
      ),
      ev('task', 'r1', 'run_finished', { runId: 'r1', run: { status: 'completed' } }, 4),
    ];

    const graph = project('conversation', 'c1', events);
    expect(graph.nodes.find((node) => node.id === 'run:task:r1')?.status).toBe('succeeded');
    expect(graph.nodes.find((node) => node.id === 'task:r1:step:s1')?.status).toBe('succeeded');
    expect(graph.nodes.find((node) => node.id === 'task:r1:step:s1')?.label).toContain('file_list');
    expect(graph.edges.filter((edge) => edge.kind === 'run_to_node')).toHaveLength(1);
  });

  it('flow：节点事件与嵌套 agent 事件挂到同一运行车道', () => {
    const events = [
      ev('flow', 'f1', 'run_started', { runId: 'f1', workflowId: 'w1', version: 1, trigger: 'manual' }, 1),
      ev('flow', 'f1', 'node_started', { runId: 'f1', nodeId: 'n1', nodeType: 'agent' }, 2),
      ev(
        'flow',
        'f1',
        'node_agent_event',
        {
          runId: 'f1',
          nodeId: 'n1',
          agentRunId: 'a1',
          event: { event: 'agent_phase', data: { runId: 'a1', phase: 'planning', role: 'planner', round: 1 } },
        },
        3,
      ),
      ev('flow', 'f1', 'node_succeeded', { runId: 'f1', nodeId: 'n1', outputs: { ok: true } }, 4),
    ];

    const graph = project('conversation', 'c1', events);
    expect(graph.nodes.map((node) => node.id)).toContain('flow:f1:node:n1');
    expect(graph.nodes.map((node) => node.id)).toContain('run:agent:a1');
    expect(graph.nodes.map((node) => node.id)).toContain('agent:a1:round:1:planner');
    expect(graph.nodes.find((node) => node.id === 'flow:f1:node:n1')?.status).toBe('succeeded');
    expect(graph.edges.some((edge) => edge.kind === 'run_to_node')).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === 'node_to_node')).toBe(true);
  });

  it('meeting：独立根节点、轮次/消息/状态车道', () => {
    const events = [
      ev('meeting', 'm1', 'meeting_turn_start', { meetingId: 'm1', mode: 'manual', speakerIds: ['a1'], autoRounds: 0, turnIndex: 0 }, 1),
      ev('meeting', 'm1', 'meeting_message', { meetingId: 'm1', message: { id: 'msg1', speakerName: '助手 A', content: '你好' } }, 2),
      ev('meeting', 'm1', 'meeting_status', { meetingId: 'm1', status: 'finished', mode: 'manual', autoRounds: 0 }, 3),
    ];

    const graph = project('meeting', 'm1', events);
    expect(graph.rootKind).toBe('meeting');
    expect(graph.nodes.map((node) => node.id)).toContain('root:meeting:m1');
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:turn:0');
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:message:msg1');
    expect(graph.nodes.find((node) => node.id === 'meeting:m1:status')?.status).toBe('succeeded');
    expect(graph.edges.some((edge) => edge.kind === 'meeting_to_turn')).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === 'turn_to_message')).toBe(true);
  });

  it('meeting_turn 缺少 turnIndex 时按 scope 内 seq 区分轮次，autoRounds 不参与身份', () => {
    const events = [
      ev('meeting', 'm1', 'meeting_turn_start', { meetingId: 'm1', mode: 'manual', speakerIds: ['a1'], autoRounds: 0 }, 1),
      ev('meeting', 'm1', 'meeting_turn_start', { meetingId: 'm1', mode: 'manual', speakerIds: ['a2'], autoRounds: 0 }, 3),
    ];
    const graph = project('meeting', 'm1', events);
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:turn:1');
    expect(graph.nodes.map((node) => node.id)).toContain('meeting:m1:turn:3');
    expect(graph.nodes.filter((node) => node.kind === 'meeting_turn')).toHaveLength(2);
  });

  it('未知/缺失载荷不抛错，且不会为空事件造节点', () => {
    const graph = project('conversation', 'c1', [
      ev('chat', 'c1', 'tool_trace', { messageId: 'a1' }, 1),
      ev('chat', 'c1', 'message_started', { messageId: 'a1' }, 2),
      ev('agent', 'r1', 'unknown_type', null, 3),
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'root:conversation:c1',
      'chat:c1:message:a1',
      'run:agent:r1',
    ]);
    expect(graph.nodes.find((node) => node.id === 'chat:c1:message:a1')?.status).toBe('running');
  });

  it('limit 保留根节点与最近节点，并标记 truncated', () => {
    const events = [
      ev('chat', 'c1', 'message_started', { messageId: 'm1', role: 'user', content: '1' }, 1),
      ev('chat', 'c1', 'message_started', { messageId: 'm2', role: 'user', content: '2' }, 2),
      ev('chat', 'c1', 'message_started', { messageId: 'm3', role: 'user', content: '3' }, 3),
    ];
    const graph = project('conversation', 'c1', events, 2);
    expect(graph.truncated).toBe(true);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]?.id).toBe('root:conversation:c1');
    expect(graph.nodes[1]?.summary).toBe('3');
  });

  it('过滤其他根的事件', () => {
    const graph = project('conversation', 'c1', [
      ev('chat', 'c2', 'message_started', { messageId: 'other', role: 'user', content: '别的会话' }, 1),
      ev('meeting', 'm1', 'meeting_message', { meetingId: 'm1', message: { id: 'msg', speakerName: 'A', content: 'x' } }, 2),
      ev('chat', 'c1', 'message_started', { messageId: 'mine', role: 'user', content: '本会话' }, 3),
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'root:conversation:c1',
      'chat:c1:message:mine',
    ]);
  });

  it('v2.21 branch：分支车道、子会话与回传节点', () => {
    const base = {
      branchId: 'b1',
      parentConversationId: 'c1',
      childConversationId: 'c2',
      rootConversationId: 'c1',
      title: '竞品调研',
      goal: '整理竞品',
      depth: 1,
    };
    const events = [
      ev('branch', 'b1', 'branch_created', { ...base, status: 'queued' }, 1),
      ev('branch', 'b1', 'branch_started', { ...base, status: 'running' }, 2),
      ev('branch', 'b1', 'branch_status', { ...base, status: 'succeeded', statusReason: null }, 3),
      ev(
        'branch',
        'b1',
        'branch_returned',
        {
          ...base,
          status: 'succeeded',
          statusReason: null,
          summary: '竞品 A 领先',
          evidence: {
            branchId: 'b1',
            parentConversationId: 'c1',
            childConversationId: 'c2',
            rootConversationId: 'c1',
            status: 'succeeded',
            summary: '竞品 A 领先',
            artifacts: [{ id: 'art1', title: '报告', kind: 'markdown' }],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            needsReview: true,
            createdAt: '2026-11-03T00:00:03.000Z',
          },
        },
        4,
      ),
      ev(
        'branch',
        'b1',
        'branch_status',
        {
          ...base,
          status: 'succeeded',
          statusReason: null,
          archivedAt: '2026-11-03T00:00:05.000Z',
        },
        5,
      ),
    ];
    const graph = project('conversation', 'c1', events);

    expect(graph.lanes.find((lane) => lane.id === 'lane:branch:b1')).toMatchObject({
      kind: 'branch',
      archived: true,
    });
    expect(graph.nodes.find((node) => node.id === 'branch:b1')).toMatchObject({
      kind: 'branch',
      status: 'succeeded',
      label: '竞品调研',
    });
    expect(graph.nodes.some((node) => node.id === 'branch-child:b1')).toBe(true);
    expect(graph.nodes.find((node) => node.id === 'branch-return:b1')).toMatchObject({
      kind: 'branch_return',
      status: 'succeeded',
    });
    expect(graph.nodes.find((node) => node.id === 'branch-return:b1')?.summary).toContain('产物 1');
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(['parent_to_branch', 'branch_to_child', 'branch_to_return']),
    );

    // 恢复事件把车道折叠标记还原
    const restored = project('conversation', 'c1', [
      ...events,
      ev(
        'branch',
        'b1',
        'branch_status',
        { ...base, status: 'succeeded', statusReason: null, archivedAt: null },
        6,
      ),
    ]);
    expect(restored.lanes.find((lane) => lane.id === 'lane:branch:b1')?.archived).toBe(false);

    // 嵌套分支事件挂在子会话名下，不进入父图
    const nested = project('conversation', 'c1', [
      ev('branch', 'b2', 'branch_created', { ...base, branchId: 'b2', parentConversationId: 'c2' }, 1),
    ]);
    expect(nested.nodes.map((node) => node.id)).toEqual(['root:conversation:c1']);
  });
});
