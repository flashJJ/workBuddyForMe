import { createConversationRepository, createWorkPlanRepository } from '@wbfm/database';
import type { AgentRunView, SubagentRunView, TaskRunView } from '@wbfm/shared/schemas';
import { createSettingsService } from '../services/settings-service';
import { createConversationService } from '../services/conversation-service';
import type { ServiceDeps } from '../services/deps';

/**
 * v2.8 完成回投：后台作业终态后向所属会话追加一条助手消息。
 * 幂等键 run_completions(run_id, kind)：重复终态（重启/竞态）只落库一次。
 * 无会话的运行只写状态，不追加消息。
 */

const GOAL_MAX = 60;

function shortGoal(goal: string): string {
  const trimmed = goal.trim();
  return trimmed.length > GOAL_MAX ? `${trimmed.slice(0, GOAL_MAX)}…` : trimmed;
}

function taskText(run: TaskRunView, lang: 'zh-CN' | 'en-US'): string {
  const goal = shortGoal(run.goal);
  if (lang === 'en-US') {
    if (run.status === 'completed') return `Task "${goal}" finished in ${run.stepCount} steps.`;
    if (run.status === 'stopped' && run.stopReason === 'interrupted') {
      return `Task "${goal}" was interrupted by an app restart.`;
    }
    if (run.status === 'stopped') return `Task "${goal}" was stopped (${run.stopReason ?? 'user'}).`;
    return `Task "${goal}" failed after ${run.stepCount} steps.`;
  }
  if (run.status === 'completed') return `任务「${goal}」已完成，共 ${run.stepCount} 步。`;
  if (run.status === 'stopped' && run.stopReason === 'interrupted') {
    return `任务「${goal}」因应用重启被中断，可重新发起。`;
  }
  if (run.status === 'stopped') return `任务「${goal}」已停止（${run.stopReason ?? '用户终止'}）。`;
  return `任务「${goal}」执行失败，共 ${run.stepCount} 步。`;
}

function agentText(run: AgentRunView, lang: 'zh-CN' | 'en-US'): string {
  const goal = shortGoal(run.goal);
  const summary = run.finalOutcome?.summary?.trim();
  if (lang === 'en-US') {
    if (run.status === 'done') {
      return summary ? `Collaboration "${goal}" finished: ${summary}` : `Collaboration "${goal}" finished.`;
    }
    return `Collaboration "${goal}" ended (${run.status}).`;
  }
  if (run.status === 'done') {
    return summary ? `协作「${goal}」已完成：${summary}` : `协作「${goal}」已完成。`;
  }
  return `协作「${goal}」已结束（${run.status}）。`;
}

function subagentText(run: SubagentRunView, lang: 'zh-CN' | 'en-US'): string {
  const goal = shortGoal(run.goal);
  const summary = run.summary?.trim();
  const reason = run.errorMessage?.trim() || run.errorCode || null;
  if (lang === 'en-US') {
    if (run.status === 'done') {
      return summary
        ? `External agent "${goal}" finished: ${summary}`
        : `External agent "${goal}" finished.`;
    }
    if (run.status === 'cancelled') return `External agent "${goal}" was cancelled.`;
    return reason
      ? `External agent "${goal}" failed: ${reason}`
      : `External agent "${goal}" failed.`;
  }
  if (run.status === 'done') {
    return summary ? `外部代理「${goal}」已完成：${summary}` : `外部代理「${goal}」已完成。`;
  }
  if (run.status === 'cancelled') return `外部代理「${goal}」已取消。`;
  return reason ? `外部代理「${goal}」失败：${reason}` : `外部代理「${goal}」失败。`;
}

export function createRunCompletionService(deps: ServiceDeps) {
  const completions = createWorkPlanRepository(deps.db);
  const conversations = createConversationRepository(deps.db);
  const conversationService = createConversationService(deps);
  const settings = createSettingsService(deps);
  const lang = (): 'zh-CN' | 'en-US' =>
    settings.get().language === 'en-US' ? 'en-US' : 'zh-CN';

  const append = (runId: string, kind: string, status: string, conversationId: string, content: string): void => {
    if (!conversationId) return;
    if (!conversations.findById(conversationId)) return;
    if (!completions.claimCompletion(runId, kind, status)) return;
    conversationService.appendMessage({
      conversationId,
      role: 'assistant',
      content,
      status: 'completed',
    });
  };

  return {
    completeTask(run: TaskRunView): void {
      if (run.status !== 'completed' && run.status !== 'failed' && run.status !== 'stopped') return;
      append(run.id, 'task', run.status, run.conversationId, taskText(run, lang()));
    },

    completeAgent(run: AgentRunView): void {
      if (run.status === 'running') return;
      append(
        run.id,
        'agent',
        run.status,
        run.conversationId ?? '',
        agentText(run, lang()),
      );
    },

    /** v2.11：外部代理终态回投（幂等键 run_id + kind='subagent'） */
    completeSubagent(run: SubagentRunView): void {
      if (run.status === 'queued' || run.status === 'running') return;
      append(
        run.id,
        'subagent',
        run.status,
        run.conversationId ?? '',
        subagentText(run, lang()),
      );
    },

    /**
     * v2.8 定时跟进：到点（markFired 之后）向会话注入一条助手消息。
     * 幂等键用本次预定时刻，保证「最多一次」。
     */
    completeFollowUp(params: {
      scheduleId: string;
      occurrenceAt: string;
      conversationId: string;
      text: string;
    }): void {
      append(
        `schedule:${params.scheduleId}:${params.occurrenceAt}`,
        'follow_up',
        'fired',
        params.conversationId,
        params.text,
      );
    },
  };
}

export type RunCompletionService = ReturnType<typeof createRunCompletionService>;
