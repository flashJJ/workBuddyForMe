import type { TaskRunCheckpointRepository } from '@wbfm/database';
import type { AgentPlanDecision, AgentRunView } from '@wbfm/shared/schemas';
import type {
  AgentPlanContextResolver,
  AgentTaskContextResolver,
} from './agent-run-service-types';

/**
 * v4.7：协作启动上下文装配（从 agent-run-service 外迁守行数门禁）。
 * - resumeContext：续跑时说明上次中断位置
 * - resolve：规划上下文（工具域/知识库）+ 会话上下文，一次性装配
 */
export function createRunContextExtras(
  deps: {
    resolvePlanContext?: AgentPlanContextResolver;
    resolveTaskContext?: AgentTaskContextResolver;
  },
  checkpoints: TaskRunCheckpointRepository,
) {
  function resumeContext(run: AgentRunView): string | null {
    if (!run.resumedFromRunId) return null;
    const checkpoint = checkpoints.getByRunId(run.resumedFromRunId);
    if (!checkpoint) return null;
    const phase =
      checkpoint.phase === 'executing'
        ? '执行'
        : checkpoint.phase === 'reviewing'
          ? '审查'
          : '规划';
    const lines = [
      `【续跑】上次运行在「${phase}」阶段中断（第 ${checkpoint.roundNo + 1} 轮）。`,
      checkpoint.subtask ? `上轮子任务：${checkpoint.subtask.title}` : '',
      checkpoint.outcome ? `已产出结论：${checkpoint.outcome.summary}` : '',
      checkpoint.outcome?.unfinished?.length
        ? `未竟事项：${checkpoint.outcome.unfinished.join('；')}`
        : '',
      '请基于以上进度继续；已完成的步骤不要重复执行，必要时先读取现状确认。',
    ].filter(Boolean);
    return lines.join('\n');
  }

  async function resolve(run: AgentRunView): Promise<{
    availableToolScopes?: string[];
    knowledgeBaseHints?: Array<{ id: string; name: string }>;
    contextBlock?: string;
  }> {
    const planContext = deps.resolvePlanContext?.(run) ?? {};
    let conversationContext: string | null = null;
    if (run.conversationId && deps.resolveTaskContext) {
      try {
        conversationContext = await deps.resolveTaskContext(run);
      } catch {
        conversationContext = null;
      }
    }
    const contextBlock = [resumeContext(run), conversationContext]
      .filter((item): item is string => Boolean(item))
      .join('\n\n');
    return { ...planContext, ...(contextBlock ? { contextBlock } : {}) };
  }

  return { resolve, resumeContext };
}

/** v4.7 P1：计划确认门（runId → 决策回调）；取消/收尾时以 reject 唤醒 */
export function createPlanGateRegistry() {
  const gates = new Map<string, (decision: AgentPlanDecision) => void>();
  return {
    await(runId: string): Promise<AgentPlanDecision['decision']> {
      return new Promise((resolve) => {
        gates.set(runId, (decision) => resolve(decision.decision));
      });
    },
    resolve(runId: string, decision: AgentPlanDecision): boolean {
      const gate = gates.get(runId);
      if (!gate) return false;
      gates.delete(runId);
      gate(decision);
      return true;
    },
    release(runId: string): void {
      const gate = gates.get(runId);
      if (!gate) return;
      gates.delete(runId);
      gate({ decision: 'reject' });
    },
  };
}

export type PlanGateRegistry = ReturnType<typeof createPlanGateRegistry>;
