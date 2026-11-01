import { describe, expect, it } from 'vitest';
import type { ExecutorOutcome, SubtaskSpec } from '@wbfm/shared/schemas';
import {
  buildReviewMessages,
  checkAcceptanceStructural,
  parseVerdict,
} from './reviewer-protocol';

const subtask: SubtaskSpec = {
  title: '汇总组件',
  brief: '检索并汇总',
  acceptance: ['至少 5 个组件', '带引用'],
  toolScopes: ['knowledge'],
  knowledgeBaseId: 'kb-1',
};

const goodOutcome: ExecutorOutcome = {
  summary: 'LangChain 核心组件包括 Model、Prompt、Chain、Memory、Tool 等。',
  evidence: [
    { ordinal: 1, documentId: 'd1', documentName: '手册.pdf', staticKind: 'chunk' },
  ],
  toolCalls: ['knowledge_search'],
  unfinished: [],
};

describe('agents/reviewer-protocol checkAcceptanceStructural 结构初筛', () => {
  it('知识型任务：有结论+证据+无未竟事项 → 无问题', () => {
    const c = checkAcceptanceStructural(subtask, goodOutcome);
    expect(c.hasConclusion).toBe(true);
    expect(c.hasEvidenceForToolScope).toBe(true);
    expect(c.hasNoUnfinished).toBe(true);
    expect(c.issues).toHaveLength(0);
  });

  it('知识型任务无证据无工具记录 → 报证据缺失', () => {
    const c = checkAcceptanceStructural(subtask, { ...goodOutcome, evidence: [], toolCalls: [] });
    expect(c.hasEvidenceForToolScope).toBe(false);
    expect(c.issues.join()).toContain('证据');
  });

  it('绑定知识库但 toolScopes 缺省同样要求证据', () => {
    const c = checkAcceptanceStructural(
      { ...subtask, toolScopes: undefined },
      { ...goodOutcome, evidence: [], toolCalls: [] },
    );
    expect(c.hasEvidenceForToolScope).toBe(false);
  });

  it('mcp/flow/desktop 工具域有工具调用记录即视为有轨迹', () => {
    const desk: SubtaskSpec = { ...subtask, toolScopes: ['desktop'], knowledgeBaseId: null };
    const c = checkAcceptanceStructural(desk, {
      ...goodOutcome,
      evidence: [],
      toolCalls: ['mouse_click', 'keyboard_type'],
    });
    expect(c.hasEvidenceForToolScope).toBe(true);
  });

  it('无工具域的纯推理任务不强制证据', () => {
    const plain: SubtaskSpec = {
      title: '算数',
      brief: '直接回答',
      acceptance: ['结果正确'],
      knowledgeBaseId: null,
    };
    const c = checkAcceptanceStructural(plain, {
      summary: '42',
      evidence: [],
      toolCalls: [],
      unfinished: [],
    });
    expect(c.hasEvidenceForToolScope).toBe(true);
    expect(c.issues).toHaveLength(0);
  });

  it('空结论判失败；unfinished 非空给风险信号但不直接判失败', () => {
    const c1 = checkAcceptanceStructural(subtask, { ...goodOutcome, summary: '   ' });
    expect(c1.hasConclusion).toBe(false);

    const c2 = checkAcceptanceStructural(subtask, {
      ...goodOutcome,
      unfinished: ['权限不足无法打开设置'],
    });
    expect(c2.hasNoUnfinished).toBe(false);
    expect(c2.hasConclusion).toBe(true);
    expect(c2.issues.join()).toContain('未竟事项');
  });
});

describe('agents/reviewer-protocol 消息装配', () => {
  it('包含目标/标准/结论/证据/工具/初筛', () => {
    const text = buildReviewMessages({ goal: 'g', subtask, outcome: goodOutcome, round: 0 })[1]!
      .content as string;
    expect(text).toContain('至少 5 个组件');
    expect(text).toContain('手册.pdf');
    expect(text).toContain('knowledge_search');
    expect(text).toContain('结构初筛');
    expect(text).toContain('第 1 轮');
  });

  it('无证据时展示占位；未竟事项逐条列出', () => {
    const text = buildReviewMessages({
      goal: 'g',
      subtask,
      outcome: { ...goodOutcome, evidence: [], toolCalls: [], unfinished: ['缺资料'] },
      round: 1,
    })[1]!.content as string;
    expect(text).toContain('无引用证据');
    expect(text).toContain('缺资料');
    expect(text).toContain('第 2 轮');
  });
});

describe('agents/reviewer-protocol parseVerdict', () => {
  it('approve 可无意见', () => {
    const r = parseVerdict(JSON.stringify({ verdict: 'approve' }));
    expect(r.ok).toBe(true);
  });

  it('revise 必须带 reviewNotes', () => {
    expect(parseVerdict(JSON.stringify({ verdict: 'revise' })).ok).toBe(false);
    const r = parseVerdict(JSON.stringify({ verdict: 'revise', reviewNotes: '缺引用' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.review.acceptanceResults).toEqual([]);
  });

  it('reject 必须带理由', () => {
    const r = parseVerdict(JSON.stringify({ verdict: 'reject', reviewNotes: '资料不存在' }));
    expect(r.ok).toBe(true);
  });

  it('携带逐条验收结果', () => {
    const r = parseVerdict(
      JSON.stringify({
        verdict: 'revise',
        reviewNotes: 'n',
        acceptanceResults: [{ passed: true }, { passed: false, note: '只有 3 个' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.review.acceptanceResults[1]!.note).toBe('只有 3 个');
  });

  it('非法枚举/无 JSON 被拒', () => {
    expect(parseVerdict('{"verdict":"maybe"}').ok).toBe(false);
    expect(parseVerdict('无法审查').ok).toBe(false);
  });

  it('markdown 包裹容忍', () => {
    expect(
      parseVerdict('```json\n{"verdict":"approve"}\n```').ok,
    ).toBe(true);
  });
});
