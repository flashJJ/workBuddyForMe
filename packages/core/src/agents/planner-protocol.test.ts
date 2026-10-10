import { describe, expect, it } from 'vitest';
import {
  PLANNER_SYSTEM_PROMPT,
  PlannerProtocolError,
  buildAgentPlannerMessages,
  extractJsonObject,
  parsePlan,
} from './planner-protocol';

const validSubtask = {
  title: '汇总 LangChain 组件',
  brief: '在知识库中检索 LangChain 核心组件并汇总，附引用',
  acceptance: ['列出至少 5 个组件', '每条结论有引用支撑'],
  toolScopes: ['knowledge'],
  knowledgeBaseId: 'kb-1',
};

describe('agents/planner-protocol 消息装配', () => {
  it('system 协议为单条 system 消息且含输出约束', () => {
    const msgs = buildAgentPlannerMessages({
      goal: 'g',
      history: [],
      availableToolScopes: ['knowledge'],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toContain('JSON');
    expect(PLANNER_SYSTEM_PROMPT).toContain('acceptance');
  });

  it('首轮无历史时给出明确占位；无工具时提示仅能基于已有信息', () => {
    const text = buildAgentPlannerMessages({
      goal: '写总结',
      history: [],
      availableToolScopes: [],
      knowledgeBaseHint: null,
    })[1]!.content as string;
    expect(text).toContain('首轮');
    expect(text).toContain('仅能基于已有信息');
    expect(text).toContain('未绑定知识库');
  });

  it('返工时携带上轮子任务、审查意见与未通过验收项', () => {
    const text = buildAgentPlannerMessages({
      goal: 'g',
      history: [
        {
          round: 0,
          subtask: { ...validSubtask, title: '旧子任务' },
          review: {
            verdict: 'revise',
            reviewNotes: '引用不足',
            acceptanceResults: [
              { passed: true, note: '' },
              { passed: false, note: '只有 2 条引用' },
            ],
          },
        },
      ],
      availableToolScopes: ['knowledge'],
    })[1]!.content as string;
    expect(text).toContain('第 1 次派单');
    expect(text).toContain('旧子任务');
    expect(text).toContain('引用不足');
    expect(text).toContain('每条结论有引用支撑');
    expect(text).not.toContain('列出至少 5 个组件');
  });

  it('知识提示回填绑定 id', () => {
    const text = buildAgentPlannerMessages({
      goal: 'g',
      history: [],
      availableToolScopes: ['knowledge'],
      knowledgeBaseHint: { id: 'kb-9', name: '懂王ai库' },
    })[1]!.content as string;
    expect(text).toContain('kb-9');
    expect(text).toContain('懂王ai库');
  });
});

describe('agents/planner-protocol JSON 提取', () => {
  it.each([
    ['纯 JSON', '{"a":1}'],
    ['markdown 包裹', '```json\n{"a":1}\n```'],
    ['前后杂文本', '好的，这是结果：\n{"a":1}\n请查收'],
  ])('提取成功：%s', (_name, content) => {
    expect(extractJsonObject(content)).toEqual({ a: 1 });
  });

  it.each([['空串', ''], ['纯文本', '没有JSON'], ['坏 JSON', '{"a":}']])(
    '提取失败返回 null：%s',
    (_name, content) => {
      expect(extractJsonObject(content)).toBeNull();
    },
  );
});

describe('agents/planner-protocol parsePlan', () => {
  it('合法子任务解析成功', () => {
    const r = parsePlan(JSON.stringify(validSubtask));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtask.title).toBe(validSubtask.title);
      expect(r.subtask.acceptance).toHaveLength(2);
      expect(r.subtask.toolScopes).toEqual(['knowledge']);
    }
  });

  it('可选字段缺省合法', () => {
    const r = parsePlan(JSON.stringify({ title: 't', brief: 'b', acceptance: ['a'] }));
    expect(r.ok).toBe(true);
  });

  it('无 JSON 返回 no_json', () => {
    const r = parsePlan('我无法规划');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('no_json');
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['空 title', { ...validSubtask, title: '' }],
    ['缺 brief', { title: 't', acceptance: ['a'] }],
    ['验收为空数组', { ...validSubtask, acceptance: [] }],
    ['验收超 10 条', { ...validSubtask, acceptance: Array(11).fill('a') }],
    ['title 超长', { ...validSubtask, title: 'x'.repeat(101) }],
    ['brief 超长', { ...validSubtask, brief: 'x'.repeat(2001) }],
    ['工具域空串', { ...validSubtask, toolScopes: [''] }],
  ])('非法形状返回 invalid_shape：%s', (_name, raw) => {
    const r = parsePlan(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('invalid_shape');
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it('markdown 包裹的合法子任务可解析', () => {
    const r = parsePlan('```json\n' + JSON.stringify(validSubtask) + '\n```');
    expect(r.ok).toBe(true);
  });

  it('PlannerProtocolError 可携带字段级 issues', () => {
    const e = new PlannerProtocolError('invalid_shape', 'bad', ['title: 太短']);
    expect(e.code).toBe('invalid_shape');
    expect(e.issues[0]).toContain('title');
  });
});
