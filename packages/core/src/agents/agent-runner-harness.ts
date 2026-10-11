import type {
  ExecutorOutcome,
  ReviewVerdictPayload,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import type { AgentClients, AgentRunEvent } from './index';

/**
 * agent-runner 测试共享夹具（行数门禁拆分）：
 * 事件收集器、脚本化三角色客户端与协议工厂。
 */

/** 协作 runner 默认入参（无工具域/知识库） */
export const START_INPUT = { assistantId: 'a', goal: '完成目标 G' };

/** 收集异步生成器全部事件 */
export async function collect(
  gen: AsyncGenerator<AgentRunEvent>,
): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for (;;) {
    const r = await gen.next();
    if (r.done) break;
    events.push(r.value);
  }
  return events;
}

export const names = (events: AgentRunEvent[]) => events.map((e) => e.event);
export const handoffPairs = (events: AgentRunEvent[]) =>
  events
    .filter((e): e is Extract<AgentRunEvent, { event: 'agent_handoff' }> => e.event === 'agent_handoff')
    .map((e) => `${e.data.handoff.fromRole}→${e.data.handoff.toRole}`);

export function subtask(title = '子任务'): SubtaskSpec {
  return { title, brief: `${title}说明`, acceptance: ['标准1'] };
}

export function outcome(summary = '交付结论'): ExecutorOutcome {
  return { summary, evidence: [], toolCalls: [], unfinished: [] };
}

/** 脚本化裁决（acceptanceResults 在 zod 输出类型中必填，缺省空数组） */
export function verdict(
  value: ReviewVerdictPayload['verdict'],
  reviewNotes?: string,
): ReviewVerdictPayload {
  return { verdict: value, acceptanceResults: [], ...(reviewNotes ? { reviewNotes } : {}) };
}

/** 脚本化客户端工厂：按队列返回结果，失败用 reject 控制 */
export function scriptedClients(script: {
  plans: Array<SubtaskSpec | { throw: Error }>;
  verdicts: Array<ReviewVerdictPayload | { throw: Error }>;
  outcomes?: ExecutorOutcome[];
  execFails?: number;
}): AgentClients & { planCalls: number; reviewCalls: number; execCalls: number } {
  const state = { planCalls: 0, reviewCalls: 0, execCalls: 0 };
  const clients = {
    planner: {
      async plan() {
        const i = state.planCalls++;
        const item = script.plans[i] ?? script.plans[script.plans.length - 1]!;
        if ('throw' in item) throw item.throw;
        return { subtask: item, usage: { promptTokens: 10, completionTokens: 5 } };
      },
    },
    executor: {
      async run() {
        state.execCalls++;
        if (script.execFails && state.execCalls <= script.execFails) throw new Error('执行器故障');
        const o = script.outcomes?.[state.execCalls - 1] ?? outcome();
        return { outcome: o, usage: { promptTokens: 20, completionTokens: 10 }, steps: 2 };
      },
    },
    reviewer: {
      async review() {
        const i = state.reviewCalls++;
        const item = script.verdicts[i] ?? script.verdicts[script.verdicts.length - 1]!;
        if ('throw' in item) throw item.throw;
        return { review: item, usage: { promptTokens: 8, completionTokens: 4 } };
      },
    },
    get planCalls() { return state.planCalls; },
    get reviewCalls() { return state.reviewCalls; },
    get execCalls() { return state.execCalls; },
  } as AgentClients & { planCalls: number; reviewCalls: number; execCalls: number };
  return clients;
}
