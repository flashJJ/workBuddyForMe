import type { TokenUsage } from '@wbfm/shared/api';
import type { AgentPhase, AgentRole, AgentRunView } from '@wbfm/shared/schemas';
import { toUsage, type BudgetState } from '../runtime/budget';

/**
 * v4.7：runner 内联事件构造器（外迁守行数门禁）。
 * 返回对象保持与 AgentRunEvent 结构一致，调用方直接 yield。
 */
export function createRunEventEmitter(repo: { getById(id: string): AgentRunView | null }, runId: string) {
  const usage = (): TokenUsage => {
    const run = repo.getById(runId)!;
    return {
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      totalTokens: run.totalTokens,
    };
  };
  return {
    usage,
    phase(phase: AgentPhase, role: AgentRole | null, round: number) {
      return { event: 'agent_phase' as const, data: { runId, phase, role, round } };
    },
    budget(state: BudgetState) {
      return { event: 'agent_budget' as const, data: { runId, usage: toUsage(state) } };
    },
    done(summary: string) {
      return { event: 'done' as const, data: { content: summary, usage: usage() } };
    },
  };
}
