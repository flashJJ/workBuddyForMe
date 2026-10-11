import { describe, expect, it } from 'vitest';
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import type { Citation } from '@wbfm/shared/types';
import { buildExecutorOutcome, collectEvidence, collectToolCalls } from './executor-outcome';

function runView(overrides: Partial<TaskRunView> = {}): TaskRunView {
  return {
    id: 'tr',
    conversationId: 'c',
    assistantId: 'a',
    goal: 'G',
    status: 'completed',
    stepCount: 0,
    failureCount: 0,
    maxSteps: 20,
    stopReason: null,
    createdAt: '',
    updatedAt: '',
    finishedAt: null,
    ...overrides,
  };
}

function step(partial: Partial<TaskStepView> & { stepIndex: number; kind: TaskStepView['kind'] }): TaskStepView {
  return {
    id: `s${partial.stepIndex}`,
    runId: 'tr',
    toolName: null,
    reason: '',
    argsJson: '',
    resultJson: '',
    screenshotPath: '',
    status: 'completed',
    error: '',
    durationMs: 0,
    createdAt: '',
    ...partial,
  };
}

const citation = (documentId: string, ordinal: number, extra: Partial<Citation> = {}): Citation => ({
  documentId,
  documentName: `${documentId}.pdf`,
  ordinal,
  ...extra,
});

describe('buildExecutorOutcome 交付物收敛（T2.3）', () => {
  it('summary 取 final 步 message；toolCalls 首次出现序去重', () => {
    const steps = [
      step({ stepIndex: 1, kind: 'observe' }),
      step({ stepIndex: 2, kind: 'action', toolName: 'knowledge_search', resultJson: '{"summary":"命中 2 片"}' }),
      step({ stepIndex: 3, kind: 'action', toolName: 'knowledge_search', resultJson: '{"summary":"再查一次"}' }),
      step({ stepIndex: 4, kind: 'action', toolName: 'mcp:x:run' }),
      step({
        stepIndex: 5,
        kind: 'final',
        resultJson: JSON.stringify({ message: '最终结论：年假 15 天' }),
      }),
    ];
    const outcome = buildExecutorOutcome({ run: runView(), steps });
    expect(outcome.summary).toBe('最终结论：年假 15 天');
    expect(outcome.toolCalls).toEqual(['knowledge_search', 'mcp:x:run']);
    expect(outcome.unfinished).toEqual([]);
  });

  it('无 final 文本时回退最后成功动作摘要；失败动作不参与回退', () => {
    const steps = [
      step({ stepIndex: 1, kind: 'action', toolName: 'a', status: 'failed', resultJson: '{"summary":"坏结果"}' }),
      step({ stepIndex: 2, kind: 'action', toolName: 'b', resultJson: '{"summary":"好结果"}' }),
    ];
    const outcome = buildExecutorOutcome({ run: runView({ status: 'failed' }), steps });
    expect(outcome.summary).toBe('好结果');
  });

  it('evidence：跨步合并、角标连续重排、同位置去重', () => {
    const steps = [
      step({
        stepIndex: 1,
        kind: 'action',
        toolName: 'knowledge_search',
        citations: [
          citation('d1', 1, { charStart: 0, charEnd: 10 }),
          citation('d2', 2, { charStart: 5, charEnd: 20 }),
        ],
      }),
      step({
        stepIndex: 2,
        kind: 'action',
        toolName: 'knowledge_search',
        citations: [
          citation('d1', 1, { charStart: 0, charEnd: 10 }), // 同位置重复
          citation('d3', 2, { pageNo: 3 }),
        ],
      }),
    ];
    expect(collectEvidence(steps)).toEqual([
      expect.objectContaining({ documentId: 'd1', ordinal: 1, charStart: 0, charEnd: 10 }),
      expect.objectContaining({ documentId: 'd2', ordinal: 2, charStart: 5, charEnd: 20 }),
      expect.objectContaining({ documentId: 'd3', ordinal: 3, pageNo: 3 }),
    ]);
  });

  it('collectToolCalls 只收 action 步且按首次出现序', () => {
    const steps = [
      step({ stepIndex: 1, kind: 'observe' }),
      step({ stepIndex: 2, kind: 'action', toolName: 't1' }),
      step({ stepIndex: 3, kind: 'final' }),
      step({ stepIndex: 4, kind: 'action', toolName: 't1' }),
      step({ stepIndex: 5, kind: 'action', toolName: 't2' }),
    ];
    expect(collectToolCalls(steps)).toEqual(['t1', 't2']);
  });

  it('unfinished：final 声明保留（清洗非字符串/截断），非 completed 终态追加边界说明', () => {
    const steps = [
      step({
        stepIndex: 1,
        kind: 'final',
        status: 'completed',
        resultJson: JSON.stringify({ message: '结论', unfinished: ['缺一页资料', 123, '  '] }),
      }),
    ];
    const completed = buildExecutorOutcome({ run: runView(), steps });
    expect(completed.unfinished).toEqual(['缺一页资料']);

    const failed = buildExecutorOutcome({
      run: runView({ status: 'failed', stopReason: 'max_failures' }),
      steps,
      terminalNote: '执行在连续失败上限终止',
    });
    expect(failed.unfinished).toEqual(['缺一页资料', '执行在连续失败上限终止']);
  });

  it('边界：无 final 无成功动作时 summary 为空串而非 undefined', () => {
    const outcome = buildExecutorOutcome({ run: runView({ status: 'stopped' }), steps: [] });
    expect(outcome.summary).toBe('');
    expect(outcome.evidence).toEqual([]);
    expect(outcome.toolCalls).toEqual([]);
  });
});
