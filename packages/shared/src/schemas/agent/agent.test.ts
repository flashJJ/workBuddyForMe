import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET_BOUNDS,
  AGENT_BUDGET_DEFAULTS,
  AGENT_HANDOFF_EDGES,
  agentBudgetSchema,
  agentHandoffEdge,
  agentHandoffPayloadSchema,
  agentRunCreateSchema,
  executorOutcomeSchema,
  isValidHandoffEdge,
  reviewVerdictSchema,
  subtaskSpecSchema,
  type AgentHandoffEdge,
} from './agent';

const validSubtask = {
  title: '查 LangChain 核心组件',
  brief: '在懂王ai库检索并汇总 LangChain 的核心组件',
  acceptance: ['至少列出 5 个组件', '每个组件附引用'],
  toolScopes: ['knowledge'],
  knowledgeBaseId: 'kb-1',
};

describe('v1.4 协作契约：subtaskSpec', () => {
  it('合法子任务通过', () => {
    const s = subtaskSpecSchema.parse(validSubtask);
    expect(s.title).toBe(validSubtask.title);
    expect(s.acceptance).toHaveLength(2);
  });

  it.each([
    ['空标题', { ...validSubtask, title: '' }],
    ['标题超长', { ...validSubtask, title: 'x'.repeat(101) }],
    ['空 brief', { ...validSubtask, brief: '  ' }],
    ['brief 超长', { ...validSubtask, brief: 'x'.repeat(2001) }],
    ['验收标准为空数组', { ...validSubtask, acceptance: [] }],
    ['验收标准超 10 条', { ...validSubtask, acceptance: Array(11).fill('a') }],
    ['验收条目空白', { ...validSubtask, acceptance: ['  '] }],
    ['验收条目超长', { ...validSubtask, acceptance: ['x'.repeat(501)] }],
    ['工具域空串', { ...validSubtask, toolScopes: [''] }],
  ])('非法子任务被拒：%s', (_name, input) => {
    expect(subtaskSpecSchema.safeParse(input).success).toBe(false);
  });

  it('可选字段缺省通过（toolScopes/knowledgeBaseId 可空）', () => {
    const s = subtaskSpecSchema.parse({
      title: 't',
      brief: 'b',
      acceptance: ['a'],
    });
    expect(s.toolScopes).toBeUndefined();
    expect(s.knowledgeBaseId).toBeUndefined();
  });
});

describe('v1.4 协作契约：executorOutcome/reviewVerdict', () => {
  it('交付物合法并填默认空数组', () => {
    const o = executorOutcomeSchema.parse({ summary: '完成' });
    expect(o.evidence).toEqual([]);
    expect(o.toolCalls).toEqual([]);
    expect(o.unfinished).toEqual([]);
  });

  it('summary 空/超长被拒', () => {
    expect(executorOutcomeSchema.safeParse({ summary: '' }).success).toBe(false);
    expect(
      executorOutcomeSchema.safeParse({ summary: 'x'.repeat(4001) }).success,
    ).toBe(false);
  });

  it('裁决 verdict 必须在枚举内；approve 可无意见', () => {
    expect(reviewVerdictSchema.parse({ verdict: 'approve' }).verdict).toBe('approve');
    expect(reviewVerdictSchema.safeParse({ verdict: 'maybe' }).success).toBe(false);
  });

  it('revise/reject 携带超长意见被拒', () => {
    expect(
      reviewVerdictSchema.safeParse({
        verdict: 'revise',
        reviewNotes: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe('v1.4 协作契约：handoff payload', () => {
  it('三类交接形状各通过', () => {
    expect(
      agentHandoffPayloadSchema.safeParse({ subtask: validSubtask }).success,
    ).toBe(true);
    expect(agentHandoffPayloadSchema.safeParse({ outcome: { summary: 'ok' } }).success).toBe(
      true,
    );
    expect(
      agentHandoffPayloadSchema.safeParse({ verdict: 'revise', reviewNotes: '缺引用' }).success,
    ).toBe(true);
  });

  it('空交接（三类字段全缺）被拒', () => {
    expect(agentHandoffPayloadSchema.safeParse({}).success).toBe(false);
    expect(agentHandoffPayloadSchema.safeParse({ reviewNotes: 'n' }).success).toBe(false);
  });

  it('嵌套 subtask 非法时整体被拒', () => {
    expect(
      agentHandoffPayloadSchema.safeParse({ subtask: { title: '', brief: 'b', acceptance: [] } })
        .success,
    ).toBe(false);
  });
});

describe('v1.4 协作契约：预算与创建请求', () => {
  it('预算缺省填系统默认值', () => {
    expect(agentBudgetSchema.parse(undefined)).toEqual(AGENT_BUDGET_DEFAULTS);
  });

  it.each([
    ['轮次为 0', { maxRounds: 0 }],
    ['轮次超 5', { maxRounds: 6 }],
    ['步数为 0', { maxSteps: 0 }],
    ['步数超 50', { maxSteps: 51 }],
    ['token 低于下限', { maxTotalTokens: AGENT_BUDGET_BOUNDS.maxTotalTokens.min - 1 }],
    ['token 超上限', { maxTotalTokens: AGENT_BUDGET_BOUNDS.maxTotalTokens.max + 1 }],
  ])('非法预算被拒：%s', (_name, override) => {
    expect(agentBudgetSchema.safeParse(override).success).toBe(false);
  });

  it('合法覆盖通过', () => {
    const b = agentBudgetSchema.parse({ maxRounds: 1, maxSteps: 5, maxTotalTokens: 20000 });
    expect(b).toMatchObject({ maxRounds: 1, maxSteps: 5, maxTotalTokens: 20000 });
  });

  it('创建请求：assistantId/goal 必填，预算可缺省', () => {
    expect(
      agentRunCreateSchema.safeParse({ assistantId: 'a', goal: 'g' }).success,
    ).toBe(true);
    expect(agentRunCreateSchema.safeParse({ goal: 'g' }).success).toBe(false);
    expect(agentRunCreateSchema.safeParse({ assistantId: 'a', goal: '' }).success).toBe(false);
  });
});

describe('v1.4 协作契约：交接拓扑', () => {
  it('四条合法边，其余拒绝', () => {
    expect(AGENT_HANDOFF_EDGES).toHaveLength(4);
    expect(isValidHandoffEdge(agentHandoffEdge('planner', 'executor'))).toBe(true);
    expect(isValidHandoffEdge('executor:reviewer')).toBe(true);
    expect(isValidHandoffEdge('reviewer:planner')).toBe(true);
    expect(isValidHandoffEdge('reviewer:user')).toBe(true);
    expect(isValidHandoffEdge('planner:user')).toBe(false);
    expect(isValidHandoffEdge('executor:planner')).toBe(false);
    const edge: AgentHandoffEdge = 'planner:executor';
    expect(edge).toBe('planner:executor');
  });
});
