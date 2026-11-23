import type { FlowEventPayload } from '@wbfm/shared/types';
import { describe, expect, it } from 'vitest';
import { INITIAL_LIVE, applyFlowEvent, flowEventDedupeKey } from './use-flows-helpers';

const base = { runId: 'r1', workflowId: 'w1', nodeId: 'n1' };

function started(attempt?: number): FlowEventPayload {
  return {
    type: 'node_started',
    ...base,
    nodeType: 'llm',
    inputs: {},
    ...(attempt ? { attempt } : {}),
  } as FlowEventPayload;
}

describe('v4.24 修复：SSE 去重不再吞掉 v4.23 重试事件', () => {
  it('同一节点的不同 attempt 生成不同去重键', () => {
    expect(flowEventDedupeKey(started())).toBe('node_started:n1');
    expect(flowEventDedupeKey(started(2))).toBe('node_started:n1#2');
  });

  it('run 级事件仍按类型去重', () => {
    const event = { type: 'run_succeeded', runId: 'r1', workflowId: 'w1', output: null };
    expect(flowEventDedupeKey(event as FlowEventPayload)).toBe('run_succeeded');
  });

  it('重试的 node_started 能写入 nodeAttempts', () => {
    const next = applyFlowEvent(INITIAL_LIVE, started(2));
    expect(next.nodeAttempts.n1).toBe(2);
  });
});
