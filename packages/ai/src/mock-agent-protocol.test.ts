import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import { mockAgentProtocol } from './mock-agent-protocol';

/** v1.4 M5：mock 角色协议确定性回放（eval 基座，协议 JSON 必须能过 zod）。
 * ai 包不依赖 core，这里内联与 core 同形的 system 标识与消息拼装。 */

const PLANNER_SYS = `你是多智能体协作中的规划者（Planner）。
【输出协议】只输出一个 JSON 对象：
{"title":"x","brief":"b","acceptance":["a"],"toolScopes":[],"knowledgeBaseId":null}`;

const REVIEWER_SYS = `你是多智能体协作中的审查者（Reviewer）。
【输出协议】只输出一个 JSON 对象：
{"verdict":"approve|revise|reject","reviewNotes":"r","acceptanceResults":[{"passed":true,"note":""}]}`;

const TOOL_SYS = `你是一个工具型任务 Agent 的决策器。
【输出协议】只输出一个 JSON 对象：
- 执行工具：{"action":"tool","tool":"t","args":{}}`;

const SCREEN_SYS = `你是一个桌面任务 Agent 的决策器。
【输出协议】只输出一个 JSON 对象：
- 任务完成：{"action":"done","reason":"r","message":"m"}`;

function parse(reply: { content: string } | null): any {
  expect(reply).not.toBeNull();
  return JSON.parse(reply!.content) as Record<string, unknown>;
}

function plannerMessages(goal: string, scopesLine: string, kbLine: string): ChatMessage[] {
  return [
    { role: 'system', content: PLANNER_SYS },
    {
      role: 'user',
      content: [
        `【用户目标】${goal}`,
        `【可用工具域】${scopesLine}`,
        `【知识库】${kbLine}`,
        '【历史交接】\n（首轮，无返工记录）',
        '请输出子任务单 JSON。',
      ].join('\n\n'),
    },
  ];
}

function reviewerMessages(goal: string, round1Based: number, standardCount: number): ChatMessage[] {
  const standards = Array.from({ length: standardCount }, (_, i) => `${i + 1}. 标准${i + 1}`).join('\n');
  return [
    { role: 'system', content: REVIEWER_SYS },
    {
      role: 'user',
      content: [
        `【用户原始目标】${goal}`,
        `【当前轮次】第 ${round1Based} 轮`,
        '【子任务】查证\n说明',
        `【完成标准】\n${standards}`,
        '【执行者结论】\n结论',
        '【引用证据】\n[1] 制度.pdf',
        '【工具调用序列】knowledge_search',
        '【未竟事项】\n（无）',
        '【系统结构初筛（参考，不替代你的裁决）】\n· 结构初筛未发现问题',
        '请输出裁决 JSON。',
      ].join('\n\n'),
    },
  ];
}

function executorMessages(goal: string, allowed: string, history: string): ChatMessage[] {
  return [
    { role: 'system', content: TOOL_SYS },
    {
      role: 'user',
      content: [
        `【任务目标】${goal}`,
        `【可用工具】${allowed}`,
        `【历史步骤】\n${history || '（暂无）'}`,
        '【当前观察】\n观察',
        '请输出下一步决策 JSON。',
      ].join('\n\n'),
    },
  ];
}

describe('mockAgentProtocol 角色识别', () => {
  it('非角色协议（普通聊天 system）返回 null', () => {
    expect(
      mockAgentProtocol({
        messages: [
          { role: 'system', content: '你是一个普通助手。' },
          { role: 'user', content: '你好' },
        ],
      }),
    ).toBeNull();
  });

  it('screen 观察模式决策器直接 done（eval 不驱动桌面操作）', () => {
    const reply = mockAgentProtocol({
      messages: [
        { role: 'system', content: SCREEN_SYS },
        { role: 'user', content: '【任务目标】整理桌面' },
      ],
    });
    expect(parse(reply).action).toBe('done');
  });
});

describe('mockAgentProtocol Planner', () => {
  it('可用域含 knowledge 时派 knowledge 域并回填知识库 id', () => {
    const plan = parse(
      mockAgentProtocol({
        messages: plannerMessages(
          '查证报销制度 [conclusion:年假15天]',
          'knowledge',
          '助手绑定知识库：制度库（id=kb-1，需要时回填）',
        ),
      }),
    );
    expect(plan.toolScopes).toEqual(['knowledge']);
    expect(plan.knowledgeBaseId).toBe('kb-1');
    expect(plan.acceptance).toHaveLength(2);
    expect(String(plan.title)).not.toContain('[conclusion');
  });

  it('无工具域时 toolScopes 为空、knowledgeBaseId 为 null', () => {
    const plan = parse(
      mockAgentProtocol({ messages: plannerMessages('随便聊聊', '（无可用工具，仅能基于已有信息作答）', '助手未绑定知识库（knowledgeBaseId 给 null）') }),
    );
    expect(plan.toolScopes).toEqual([]);
    expect(plan.knowledgeBaseId).toBeNull();
  });

  it('混合工具域原样透传（具体工具限定名不丢失，顺序稳定）', () => {
    const plan = parse(
      mockAgentProtocol({ messages: plannerMessages('g', 'current_time、knowledge', '助手未绑定知识库（knowledgeBaseId 给 null）') }),
    );
    expect(plan.toolScopes).toEqual(['current_time', 'knowledge']);
    expect(plan.knowledgeBaseId).toBeNull();
  });
});

describe('mockAgentProtocol Reviewer', () => {
  it('默认 approve，acceptanceResults 与验收条数对齐', () => {
    const v = parse(mockAgentProtocol({ messages: reviewerMessages('查证制度', 1, 2) }));
    expect(v.verdict).toBe('approve');
    expect(v.acceptanceResults).toHaveLength(2);
    expect(v.acceptanceResults.every((r: { passed: boolean }) => r.passed)).toBe(true);
  });

  it('[review:revise-once]：首轮 revise 附理由，第二轮 approve', () => {
    const goal = '查证 [review:revise-once]';
    const first = parse(mockAgentProtocol({ messages: reviewerMessages(goal, 1, 2) }));
    expect(first.verdict).toBe('revise');
    expect(String(first.reviewNotes).length).toBeGreaterThan(0);
    expect(first.acceptanceResults.every((r: { passed: boolean }) => !r.passed)).toBe(true);

    const second = parse(mockAgentProtocol({ messages: reviewerMessages(goal, 2, 2) }));
    expect(second.verdict).toBe('approve');
  });

  it('[review:reject]：直接 reject', () => {
    expect(parse(mockAgentProtocol({ messages: reviewerMessages('g [review:reject]', 1, 1) })).verdict).toBe('reject');
  });

  it('[__switch:reviewer-off]：即使标注 revise-once 也恒 approve（反向开关）', () => {
    const v = parse(
      mockAgentProtocol({ messages: reviewerMessages('g [review:revise-once] [__switch:reviewer-off]', 1, 1) }),
    );
    expect(v.verdict).toBe('approve');
  });
});

describe('mockAgentProtocol Executor（tool 观察模式）', () => {
  it('无历史时调用序列首个工具（knowledge_search 带 query）', () => {
    const d = parse(mockAgentProtocol({ messages: executorMessages('查证报销', 'knowledge_search', '') }));
    expect(d.action).toBe('tool');
    expect(d.tool).toBe('knowledge_search');
    expect(String(d.args.query)).toContain('报销');
  });

  it('按脚本序列调用下一个未执行工具（current_time→knowledge_search 保序）', () => {
    const d = parse(
      mockAgentProtocol({
        messages: executorMessages(
          'g [tools:current_time,knowledge_search]',
          'current_time、knowledge_search',
          '#2 [action] current_time（eval 脚本理由） → completed',
        ),
      }),
    );
    expect(d.tool).toBe('knowledge_search');
  });

  it('已执行工具带中文理由括号时仍正确去重（防止重复调用到步数耗尽）', () => {
    const d = parse(
      mockAgentProtocol({
        messages: executorMessages(
          'g [conclusion:done]',
          'knowledge_search',
          '#2 [action] knowledge_search（取证） → completed',
        ),
      }),
    );
    expect(d.action).toBe('done');
  });

  it('序列完成后 done，message 含结论锚点', () => {
    const d = parse(
      mockAgentProtocol({
        messages: executorMessages(
          'g [conclusion:年假15天]',
          'knowledge_search',
          '#2 [action] knowledge_search → completed',
        ),
      }),
    );
    expect(d.action).toBe('done');
    expect(String(d.message)).toContain('年假15天');
    expect(d.unfinished).toEqual([]);
  });

  it('无可用工具（knowledge 反向态）：done 且 unfinished 非空', () => {
    const d = parse(mockAgentProtocol({ messages: executorMessages('g', '（无）', '') }));
    expect(d.action).toBe('done');
    expect((d.unfinished as string[]).length).toBeGreaterThan(0);
  });

  it('slow marker 透传延迟', () => {
    expect(mockAgentProtocol({ messages: executorMessages('g [slow:120]', 'knowledge_search', '') })!.delayMs).toBe(120);
  });
});
