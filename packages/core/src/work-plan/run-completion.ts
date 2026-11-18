import {
  createConversationRepository,
  createTaskRunRepository,
  createWorkPlanRepository,
} from '@wbfm/database';
import type { AgentRunView, SubagentRunView, TaskRunView } from '@wbfm/shared/schemas';
import { recordAgentRunMemory } from './task-memory';
import { createSettingsService } from '../services/settings/settings-service';
import { createConversationService } from '../services/assistant/conversation-service';
import type { ServiceDeps } from '../services/base/deps';

/**
 * v2.8 完成回投：后台作业终态后向所属会话追加一条助手消息。
 * 幂等键 run_completions(run_id, kind)：重复终态（重启/竞态）只落库一次。
 * 无会话的运行只写状态，不追加消息。
 */

const GOAL_MAX = 60;
/** 回投正文中的证据/未竟项单项上限与条数上限（避免刷屏） */
const DETAIL_ITEM_MAX = 120;
const DETAIL_MAX_ITEMS = 5;

function shortGoal(goal: string): string {
  const trimmed = goal.trim();
  return trimmed.length > GOAL_MAX ? `${trimmed.slice(0, GOAL_MAX)}…` : trimmed;
}

function clipDetail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > DETAIL_ITEM_MAX ? `${trimmed.slice(0, DETAIL_ITEM_MAX)}…` : trimmed;
}

/** 从 task_steps 的 final 步取模型收尾正文（v4.7：不再只回一行状态） */
function taskFinalMessage(
  tasks: ReturnType<typeof createTaskRunRepository>,
  runId: string,
): string | null {
  const finalStep = [...tasks.listSteps(runId)].reverse().find((step) => step.kind === 'final');
  if (!finalStep?.resultJson) return null;
  try {
    const parsed = JSON.parse(finalStep.resultJson) as { message?: string };
    return parsed.message?.trim() || null;
  } catch {
    return null;
  }
}

function taskText(run: TaskRunView, lang: 'zh-CN' | 'en-US', finalMessage?: string | null): string {
  const goal = shortGoal(run.goal);
  if (lang === 'en-US') {
    if (run.status === 'completed') {
      return finalMessage
        ? `Task "${goal}" finished: ${clipDetail(finalMessage)}`
        : `Task "${goal}" finished in ${run.stepCount} steps.`;
    }
    if (run.status === 'stopped' && run.stopReason === 'interrupted') {
      return `Task "${goal}" was interrupted by an app restart.`;
    }
    if (run.status === 'stopped') return `Task "${goal}" was stopped (${run.stopReason ?? 'user'}).`;
    return finalMessage
      ? `Task "${goal}" failed: ${clipDetail(finalMessage)}`
      : `Task "${goal}" failed after ${run.stepCount} steps.`;
  }
  if (run.status === 'completed') {
    return finalMessage
      ? `任务「${goal}」已完成：${clipDetail(finalMessage)}`
      : `任务「${goal}」已完成，共 ${run.stepCount} 步。`;
  }
  if (run.status === 'stopped' && run.stopReason === 'interrupted') {
    return `任务「${goal}」因应用重启被中断，可重新发起。`;
  }
  if (run.status === 'stopped') return `任务「${goal}」已停止（${run.stopReason ?? '用户终止'}）。`;
  return finalMessage
    ? `任务「${goal}」执行失败：${clipDetail(finalMessage)}`
    : `任务「${goal}」执行失败，共 ${run.stepCount} 步。`;
}

/** 证据名称 + 未竟事项（协作回投完整化） */
function agentDetails(run: AgentRunView, lang: 'zh-CN' | 'en-US'): string {
  const evidence = (run.finalOutcome?.evidence ?? [])
    .map((c) => c.documentName?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, DETAIL_MAX_ITEMS);
  const unfinished = (run.finalOutcome?.unfinished ?? [])
    .map(clipDetail)
    .filter(Boolean)
    .slice(0, DETAIL_MAX_ITEMS);
  const lines = [
    evidence.length > 0
      ? `${lang === 'en-US' ? 'Evidence' : '证据'}：${[...new Set(evidence)].join('、')}`
      : '',
    unfinished.length > 0
      ? `${lang === 'en-US' ? 'Unfinished' : '未竟事项'}：${unfinished.join('；')}`
      : '',
  ].filter(Boolean);
  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}

function agentText(run: AgentRunView, lang: 'zh-CN' | 'en-US'): string {
  const goal = shortGoal(run.goal);
  const summary = run.finalOutcome?.summary?.trim();
  const details = agentDetails(run, lang);
  if (lang === 'en-US') {
    if (run.status === 'done') {
      return summary ? `Collaboration "${goal}" finished: ${summary}${details}` : `Collaboration "${goal}" finished.`;
    }
    return `Collaboration "${goal}" ended (${run.status}).${details}`;
  }
  if (run.status === 'done') {
    return summary ? `协作「${goal}」已完成：${summary}${details}` : `协作「${goal}」已完成。${details}`;
  }
  return `协作「${goal}」已结束（${run.status}）。${details}`;
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
  const tasks = createTaskRunRepository(deps.db);
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
      const finalMessage = taskFinalMessage(tasks, run.id);
      append(run.id, 'task', run.status, run.conversationId, taskText(run, lang(), finalMessage));
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
      // v4.7 P2：任务级记忆沉淀（失败不阻断回投）
      void recordAgentRunMemory(deps, run).catch(() => undefined);
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
