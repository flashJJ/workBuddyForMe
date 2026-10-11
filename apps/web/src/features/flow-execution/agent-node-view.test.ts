'use client';

import { describe, expect, it } from 'vitest';
import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowCanvasNode } from '../flow-editor/graph-utils';
import { buildAgentView } from './agent-node-view';

const base = { runId: 'fr1', workflowId: 'wf1', nodeId: 'ag' };

const agentNode = {
  id: 'ag',
  type: 'agent',
  position: { x: 0, y: 0 },
  data: { config: { goal: 'g', maxRounds: 2 } },
} as unknown as FlowCanvasNode;

const events: FlowEventPayload[] = [
  { type: 'node_started', ...base, nodeType: 'agent', inputs: {} },
  {
    type: 'node_agent_event',
    ...base,
    agentRunId: 'ar1',
    event: { event: 'agent_phase', data: { runId: 'ar1', phase: 'planning', role: 'planner', round: 0 } },
  },
  {
    type: 'node_agent_event',
    ...base,
    agentRunId: 'ar1',
    event: {
      event: 'agent_handoff',
      data: {
        runId: 'ar1',
        handoff: {
          id: 'h1', runId: 'ar1', roundNo: 0, seq: 1, fromRole: 'planner', toRole: 'executor',
          createdAt: 't',
          payload: { subtask: { title: '子任务', brief: '说明', acceptance: ['a1'] } },
        },
      },
    },
  },
  {
    type: 'node_agent_event',
    ...base,
    agentRunId: 'ar1',
    event: {
      event: 'agent_handoff',
      data: {
        runId: 'ar1',
        handoff: {
          id: 'h2', runId: 'ar1', roundNo: 0, seq: 2, fromRole: 'executor', toRole: 'reviewer',
          createdAt: 't',
          payload: {
            outcome: {
              summary: '结论',
              evidence: [{ documentId: 'd1', documentName: '制度.pdf', ordinal: 1 }],
              toolCalls: ['knowledge_search'],
              unfinished: [],
            },
          },
        },
      },
    },
  },
  {
    type: 'node_succeeded',
    ...base,
    outputs: {
      runId: 'ar1',
      status: 'done',
      rounds: 1,
      summary: '结论',
      evidence: [{ documentId: 'd1', documentName: '制度.pdf', ordinal: 1 }],
      unfinished: [],
    },
  },
];

describe('buildAgentView（Flow agent 节点子泳道视图）', () => {
  it('内部协作帧聚合成泳道卡，终态枚举取 node_succeeded 输出', () => {
    const view = buildAgentView(events, agentNode);
    expect(view).not.toBeNull();
    if (!view) throw new Error('expected view');
    expect(view.runId).toBe('ar1');
    expect(view.state.status).toBe('done');
    expect(view.state.summary).toBe('结论');
    expect(view.state.rounds).toHaveLength(1);
    expect(view.state.rounds[0]!.subtask?.title).toBe('子任务');
    expect(view.state.rounds[0]!.outcome?.toolCalls).toEqual(['knowledge_search']);
    // 预算取节点配置覆盖（maxRounds=2），其余回落默认
    expect(view.state.budget?.maxRounds).toBe(2);
    expect(view.state.budget?.maxSteps).toBe(20);
  });

  it('失败终态：无内部帧也能构出 failed 卡', () => {
    const view = buildAgentView(
      [{ type: 'node_failed', ...base, message: '协作失败' }] as FlowEventPayload[],
      agentNode,
    );
    expect(view).not.toBeNull();
    if (!view) throw new Error('expected failed view');
    expect(view.state.status).toBe('failed');
    expect(view.state.errorMessage).toBe('协作失败');
  });

  it('无任何 agent 相关事件返回 null', () => {
    expect(buildAgentView([], agentNode)).toBeNull();
  });
});
