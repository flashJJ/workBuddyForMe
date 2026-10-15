import { describe, expect, it } from 'vitest';
import type { AgentHandoffView, StageDirection } from '@wbfm/shared/schemas';
import {
  adaptStageFrame,
  AGENT_ROLE_SLOT,
  createAgentStageCast,
  INITIAL_STAGE_ADAPTER_STATE,
  openingDirections,
  type StageAdapterState,
  type StageAgentFrame,
} from './stage-adapter';

/** 顺序喂录制帧，拍平全部指令（适配器是严格串行队列的纯映射） */
function replay(frames: StageAgentFrame[]): StageDirection[] {
  const state: StageAdapterState = { ...INITIAL_STAGE_ADAPTER_STATE };
  const out: StageDirection[] = [];
  for (const frame of frames) out.push(...adaptStageFrame(state, frame));
  return out;
}

function handoff(partial: Partial<AgentHandoffView> & Pick<AgentHandoffView, 'fromRole' | 'toRole'>): StageAgentFrame {
  return {
    event: 'agent_handoff',
    data: {
      runId: 'run-1',
      handoff: {
        id: 'h-1',
        runId: 'run-1',
        roundNo: 1,
        seq: 1,
        payload: {},
        createdAt: '2026-10-15T00:00:00.000Z',
        ...partial,
      },
    },
  };
}

describe('v1.9 M2 stage-adapter 纯映射', () => {
  it('开场 cast：三角色固定左规划/中执行/右审查，形象回落默认模型', () => {
    const members = createAgentStageCast();
    expect(members.map((m) => [m.slot, m.refId, m.avatarModelId])).toEqual([
      ['left', 'planner', 'hiyori'],
      ['center', 'executor', 'haru'],
      ['right', 'reviewer', 'mao'],
    ]);
    // 场景 cast 覆盖优先
    const overridden = createAgentStageCast({ left: 'mark' });
    expect(overridden[0]!.avatarModelId).toBe('mark');
    expect(openingDirections()[0]).toMatchObject({ t: 'cast' });
  });

  it('agent_phase：focus 转移到对应槽，主角 thinking/working，其余倾听', () => {
    const dirs = replay([
      { event: 'agent_phase', data: { runId: 'r', phase: 'planning', role: 'planner', round: 1 } },
      { event: 'agent_phase', data: { runId: 'r', phase: 'executing', role: 'executor', round: 1 } },
    ]);
    expect(dirs.filter((d) => d.t === 'focus').map((d) => (d.t === 'focus' ? d.slot : null))).toEqual([
      'left',
      'center',
    ]);
    // planning：左槽 thinking，其余 listening
    const planning = dirs.slice(0, 4);
    expect(planning).toContainEqual({ t: 'motion', slot: 'left', group: 'thinking' });
    expect(planning).toContainEqual({ t: 'motion', slot: 'center', group: 'listening' });
    expect(planning).toContainEqual({ t: 'motion', slot: 'right', group: 'listening' });
    // executing：中槽 working
    expect(dirs).toContainEqual({ t: 'motion', slot: 'center', group: 'working' });
  });

  it('planner→executor 交接：planner 念子任务标题（≤1 句），focus 转中槽', () => {
    const dirs = replay([
      handoff({
        fromRole: 'planner',
        toRole: 'executor',
        payload: {
          subtask: {
            title: '整理本周缺陷清单',
            brief: '按优先级排序并标注负责人',
            acceptance: ['清单可导出'],
          },
        },
      }),
    ]);
    const line = dirs.find((d) => d.t === 'speech');
    expect(line).toMatchObject({ t: 'speech', slot: 'left' });
    if (line?.t === 'speech') {
      expect(line.text).toBe('整理本周缺陷清单');
      // 不念 brief/acceptance 全文
      expect(line.text).not.toContain('优先级');
    }
    expect(dirs).toContainEqual({ t: 'focus', slot: 'center' });
    expect(dirs).toContainEqual({ t: 'motion', slot: 'center', group: 'working' });
  });

  it('executor→reviewer 交接：执行摘要一句，长文截断不超限', () => {
    const longSummary = '完成了清理'.repeat(40);
    const dirs = replay([
      handoff({
        fromRole: 'executor',
        toRole: 'reviewer',
        payload: { outcome: { summary: longSummary, evidence: [], toolCalls: [], unfinished: [] } },
      }),
    ]);
    const line = dirs.find((d) => d.t === 'speech');
    expect(line).toMatchObject({ t: 'speech', slot: 'center' });
    if (line?.t === 'speech') expect(line.text.length).toBeLessThanOrEqual(80);
    expect(dirs).toContainEqual({ t: 'focus', slot: 'right' });
  });

  it('reviewer 裁决：approve 喜悦谢幕散焦；revise 返工回左槽；reject 难过', () => {
    const approve = replay([
      handoff({ fromRole: 'reviewer', toRole: 'user', payload: { verdict: 'approve' } }),
    ]);
    expect(approve).toContainEqual({ t: 'focus', slot: null });
    expect(approve).toContainEqual({ t: 'expression', slot: 'right', tag: 'joy' });
    expect(approve.some((d) => d.t === 'speech')).toBe(true);

    const revise = replay([
      handoff({
        fromRole: 'reviewer',
        toRole: 'planner',
        payload: { verdict: 'revise', reviewNotes: '边界用例没覆盖' },
      }),
    ]);
    expect(revise).toContainEqual({ t: 'focus', slot: 'left' });
    expect(revise).toContainEqual({ t: 'motion', slot: 'left', group: 'thinking' });
    const reviseLine = revise.find((d) => d.t === 'speech');
    expect(reviseLine?.t === 'speech' && reviseLine.text).toContain('边界用例没覆盖');

    const reject = replay([
      handoff({ fromRole: 'reviewer', toRole: 'user', payload: { verdict: 'reject' } }),
    ]);
    expect(reject).toContainEqual({ t: 'expression', slot: 'right', tag: 'sadness' });
    expect(reject).toContainEqual({ t: 'focus', slot: null });
  });

  it('agent_delta：planner/reviewer 文本上屏；executor 工具流不产生台词只挂 working', () => {
    const dirs = replay([
      { event: 'agent_delta', data: { runId: 'r', role: 'planner', content: '我先拆三步' } },
      { event: 'agent_delta', data: { runId: 'r', role: 'executor', content: '调用工具 knowledge_search……' } },
      { event: 'agent_delta', data: { runId: 'r', role: 'reviewer', content: '我来看结果' } },
    ]);
    const lines = dirs.filter((d) => d.t === 'speech');
    expect(lines).toHaveLength(2);
    expect(lines.map((d) => (d.t === 'speech' ? d.slot : null))).toEqual(['left', 'right']);
    expect(dirs).toContainEqual({ t: 'motion', slot: AGENT_ROLE_SLOT.executor, group: 'working' });
  });

  it('agent_tool_confirm 无台词、无按钮指令，executor 挂 thinking；agent_budget 零指令', () => {
    const dirs = replay([
      {
        event: 'agent_tool_confirm',
        data: { runId: 'r', callId: 'c1', tool: 'write_file', permission: 'danger', argsSummary: '{}', taskScope: 't1' },
      },
      { event: 'agent_budget', data: { runId: 'r', usage: { round: 0, steps: 1, promptTokens: 1, completionTokens: 1, totalTokens: 2 } } },
    ]);
    expect(dirs.some((d) => d.t === 'speech')).toBe(false);
    expect(dirs).toContainEqual({ t: 'motion', slot: 'center', group: 'thinking' });
  });

  it('done 散焦归位不重复造台词；error 给固定失败短台词并散焦', () => {
    const done = replay([{ event: 'done', data: { content: '最终总结正文', usage: null } }]);
    expect(done).toContainEqual({ t: 'focus', slot: null });
    expect(done.some((d) => d.t === 'speech')).toBe(false);

    const failed = replay([{ event: 'error', data: { code: 'MODEL_403', message: '通道拒绝' } }]);
    expect(failed.some((d) => d.t === 'speech' && d.slot === 'center')).toBe(true);
    expect(failed).toContainEqual({ t: 'focus', slot: null });
    // 固定文案，不新编、不直念服务端原始报错
    const line = failed.find((d) => d.t === 'speech');
    expect(line?.t === 'speech' && line.text).not.toContain('MODEL_403');
  });

  it('speech.seq 按帧序严格递增', () => {
    const dirs = replay([
      { event: 'agent_delta', data: { runId: 'r', role: 'planner', content: '第一句' } },
      handoff({ fromRole: 'planner', toRole: 'executor', payload: { subtask: { title: '第二句', brief: 'b', acceptance: ['a'] } } }),
    ]);
    const seqs = dirs.filter((d) => d.t === 'speech').map((d) => (d.t === 'speech' ? d.seq : -1));
    expect(seqs).toEqual([1, 2]);
  });
});
