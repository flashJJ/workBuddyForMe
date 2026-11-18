import { describe, expect, it } from 'vitest';
import type { TaskStepView } from '@wbfm/shared/schemas';
import {
  condenseStepHistory,
  formatStepDigest,
  STEP_HISTORY_KEEP_RECENT,
} from './step-condenser';

function step(index: number, overrides: Partial<TaskStepView> = {}): TaskStepView {
  return {
    id: `s${index}`,
    runId: 'r1',
    stepIndex: index,
    kind: 'action',
    toolName: 'knowledge_search',
    reason: `检索${index}`,
    argsJson: '{}',
    resultJson: JSON.stringify({ summary: `命中 ${index} 片` }),
    screenshotPath: '',
    status: 'completed',
    error: '',
    durationMs: 0,
    createdAt: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

function makeSteps(count: number): TaskStepView[] {
  return Array.from({ length: count }, (_, i) => step(i + 1));
}

describe('condenseStepHistory（v4.7 任务历史 Condenser）', () => {
  it('空历史给「（暂无）」', () => {
    expect(condenseStepHistory([])).toBe('（暂无）');
  });

  it('预算充足时保留全部步骤（不再固定 12 条截断）', () => {
    const text = condenseStepHistory(makeSteps(30), { budgetTokens: 100_000 });
    expect(text).toContain('#1 [action]');
    expect(text).toContain('#15 [action]');
    expect(text).toContain('#30 [action]');
    expect(text).not.toContain('中间省略');
  });

  it('预算不足时保留首部与最近 K 步，中段聚合成省略摘要', () => {
    const text = condenseStepHistory(makeSteps(30), { budgetTokens: 60 });
    expect(text).toContain('#1 [action]');
    expect(text).toContain('#2 [action]');
    expect(text).toContain(`#${30} [action]`);
    expect(text).toContain('中间省略');
    expect(text).toContain('knowledge_search×');
    // 中段靠前步骤不应逐条出现（被省略摘要替代）
    expect(text).not.toContain('#15 [action]');
  });

  it('最近步骤始终保留：预算极小时也不丢最后一步', () => {
    const steps = makeSteps(30);
    const text = condenseStepHistory(steps, { budgetTokens: 1 });
    expect(text).toContain(`#${30} [action]`);
    expect(text.split('\n').length).toBeGreaterThanOrEqual(STEP_HISTORY_KEEP_RECENT);
  });

  it('失败步保留原因，成功步保留结果摘要（保真）', () => {
    const text = condenseStepHistory(
      [
        step(1),
        step(2, { status: 'failed', error: '检索词不能为空', resultJson: '' }),
        step(3, { resultJson: JSON.stringify({ summary: '命中 https://example.com/a 3 片' }) }),
      ],
      { budgetTokens: 10_000 },
    );
    expect(text).toContain('失败：检索词不能为空');
    expect(text).toContain('https://example.com/a');
  });
});

describe('formatStepDigest', () => {
  it('输出步骤号/类型/工具/理由/状态/结果摘要', () => {
    const line = formatStepDigest(step(7));
    expect(line).toContain('#7 [action] knowledge_search');
    expect(line).toContain('（检索7）');
    expect(line).toContain('completed');
    expect(line).toContain('命中 7 片');
  });
});
