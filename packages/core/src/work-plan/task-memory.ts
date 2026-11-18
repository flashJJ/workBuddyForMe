import { createAssistantRepository } from '@wbfm/database';
import type { AgentRunView } from '@wbfm/shared/schemas';
import { createMemoryService } from '../memory/memory-service';
import type { ServiceDeps } from '../services/base/deps';

/**
 * v4.7 P2：任务级记忆沉淀。
 * 协作终态后把「目标 + 结论 + 证据 + 未竟项」写成一条 assistant 作用域的情景记忆，
 * 供同助手的后续对话/任务召回；失败任务同样沉淀，避免重复踩坑。
 *
 * 只写一次：subjectKey 按 run.id 固定，重复回调由记忆写入管线去重/合并。
 * 失败不阻断回投（fire-and-forget 由调用方保证）。
 */

const GOAL_MAX = 120;
const CONTENT_MAX = 1_200;
const EVIDENCE_MAX = 5;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function buildTaskMemoryContent(run: AgentRunView): string | null {
  const outcome = run.finalOutcome;
  const summary = outcome?.summary?.trim() ?? '';
  const error = run.errorMessage?.trim() ?? '';
  if (!summary && !error) return null;

  const goal = clip(run.goal, GOAL_MAX);
  const evidence = (outcome?.evidence ?? [])
    .map((citation) => citation.documentName?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, EVIDENCE_MAX);
  const unfinished = (outcome?.unfinished ?? []).slice(0, 5);

  const head =
    run.status === 'done'
      ? `任务「${goal}」成功完成。结论：${clip(summary, CONTENT_MAX)}`
      : `任务「${goal}」未成功（${run.status === 'budget_exceeded' ? '预算触顶' : '失败'}）：${clip(error || summary, CONTENT_MAX)}`;
  const detail = [
    run.status !== 'done' && summary ? `已产出：${clip(summary, CONTENT_MAX)}` : '',
    evidence.length > 0 ? `证据：${[...new Set(evidence)].join('、')}` : '',
    unfinished.length > 0 ? `未竟事项：${unfinished.join('；')}` : '',
  ].filter(Boolean);
  return clip([head, ...detail].join('\n'), CONTENT_MAX);
}

/** 协作终态沉淀；非终态/助手关闭记忆/无内容时静默跳过 */
export async function recordAgentRunMemory(deps: ServiceDeps, run: AgentRunView): Promise<void> {
  if (run.status !== 'done' && run.status !== 'failed' && run.status !== 'budget_exceeded') return;
  const assistant = run.assistantId
    ? createAssistantRepository(deps.db).findById(run.assistantId)
    : null;
  if (!assistant?.memoryEnabled) return;
  const content = buildTaskMemoryContent(run);
  if (!content) return;

  await createMemoryService(deps).rememberOne({
    kind: 'event',
    content,
    importance: run.status === 'done' ? 0.55 : 0.4,
    scope: 'assistant',
    assistantId: run.assistantId,
    sourceConversationId: run.conversationId,
    source: 'summary',
    subjectKey: `agent-task:${run.id}`,
  });
}
