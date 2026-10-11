import { describe, expect, it } from 'vitest';
import type { FlowEventPayload } from '@wbfm/shared/types';
import { createSubstepCollector } from './flow-substeps';

/**
 * v1.4 M3：agent 节点内部协作帧（node_agent_event）映射为
 * 「运行中」子步骤且不新增条目；终态由 node_succeeded 原地更新。
 */
describe('flow-substeps：node_agent_event（T3 子步骤映射）', () => {
  const base = { runId: 'r1', workflowId: 'wf1' };
  const titleOf = (id: string) => (id === 'ag' ? '多智能体协作' : id);

  it('内部协作帧映射为 running；多帧不重复建条目', () => {
    const collector = createSubstepCollector(titleOf);
    const started = collector.absorb({ type: 'node_started', ...base, nodeId: 'ag', nodeType: 'agent', inputs: {} });
    expect(started).toMatchObject({ id: 'ag', status: 'running' });

    for (let i = 0; i < 3; i += 1) {
      const sub = collector.absorb({
        type: 'node_agent_event',
        ...base,
        nodeId: 'ag',
        agentRunId: 'ar1',
        event: { event: 'agent_phase', data: { runId: 'ar1', phase: 'planning', role: 'planner', round: i } },
      } as FlowEventPayload);
      expect(sub).toMatchObject({ id: 'ag', status: 'running' });
    }
    expect(collector.list()).toHaveLength(1);

    const done = collector.absorb({
      type: 'node_succeeded',
      ...base,
      nodeId: 'ag',
      outputs: { status: 'done', rounds: 1, summary: '完成' },
    });
    expect(done).toMatchObject({ id: 'ag', status: 'ok' });
    expect(collector.list()).toHaveLength(1);
  });

  it('run_* 收尾事件不产生子步骤', () => {
    const collector = createSubstepCollector(titleOf);
    expect(collector.absorb({ type: 'run_started', ...base, version: 1, trigger: 'manual' })).toBeNull();
    expect(collector.list()).toHaveLength(0);
  });
});
