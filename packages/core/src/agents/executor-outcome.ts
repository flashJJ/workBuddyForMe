import { AGENT_LIMITS, type ExecutorOutcome } from '@wbfm/shared/schemas';
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import type { Citation } from '@wbfm/shared/types';

/**
 * v1.4 M2 ExecutorOutcome 收敛（纯函数，T2.3）：
 * 从 task-loop 落库的步骤轨迹统一收敛结构化交付物——
 * - summary：模型收尾文本（final 步 message）；缺失时回退最后一个成功动作摘要；
 * - evidence：action 步工具命中的 Citation（与对话 citations 同源），跨调用去重后重排角标；
 * - toolCalls：action 步工具名首次出现序（去重有序，供审计/eval）；
 * - unfinished：模型在 final 步声明；非 completed 终态追加调用方给的边界说明。
 */

export interface BuildExecutorOutcomeInput {
  run: TaskRunView;
  steps: TaskStepView[];
  /** 非 completed 终态（熔断/步数/失败）时追加的未竟说明；completed 不用 */
  terminalNote?: string;
}

/** 跨多次工具调用去重身份：同文档同片段位置（页/段/字符区间）视为一条 */
function citationKey(c: Citation): string {
  return [
    c.documentId,
    c.staticKind ?? 'chunk',
    c.pageNo ?? '',
    c.paragraphNo ?? '',
    c.charStart ?? '',
    c.charEnd ?? '',
  ].join('|');
}

function safeParseResultJson(step: TaskStepView): { message?: string; unfinished?: unknown } {
  if (!step.resultJson) return {};
  try {
    return JSON.parse(step.resultJson) as { message?: string; unfinished?: unknown };
  } catch {
    return {};
  }
}

function clipSummary(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > AGENT_LIMITS.OUTCOME_SUMMARY_MAX
    ? trimmed.slice(0, AGENT_LIMITS.OUTCOME_SUMMARY_MAX)
    : trimmed;
}

/** 合并各步引用：按步序去重，角标 ordinal 从 1 连续重排（单次检索内编号不能跨调用拼接） */
export function collectEvidence(steps: TaskStepView[]): Citation[] {
  const seen = new Set<string>();
  const merged: Citation[] = [];
  for (const step of steps) {
    for (const citation of step.citations ?? []) {
      const key = citationKey(citation);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...citation, ordinal: merged.length + 1 });
      if (merged.length >= 30) return merged;
    }
  }
  return merged;
}

/** action 步工具名：首次出现序去重；过滤空名与失败步？失败调用也是轨迹的一部分，保留 */
export function collectToolCalls(steps: TaskStepView[]): string[] {
  const seen = new Set<string>();
  const calls: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'action' || !step.toolName) continue;
    if (seen.has(step.toolName)) continue;
    seen.add(step.toolName);
    calls.push(step.toolName);
    if (calls.length >= 100) break;
  }
  return calls;
}

function collectUnfinished(steps: TaskStepView[]): string[] {
  const finalStep = [...steps].reverse().find((s) => s.kind === 'final');
  const raw = finalStep ? safeParseResultJson(finalStep).unfinished : undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 20);
}

function resolveSummary(steps: TaskStepView[]): string {
  const finalStep = [...steps].reverse().find((s) => s.kind === 'final');
  const finalMessage = finalStep ? safeParseResultJson(finalStep).message?.trim() : '';
  if (finalMessage) return clipSummary(finalMessage);
  const lastAction = [...steps].reverse().find((s) => s.kind === 'action' && s.status === 'completed');
  if (lastAction) {
    const parsed = safeParseResultJson(lastAction) as { summary?: string };
    if (parsed.summary?.trim()) return clipSummary(parsed.summary);
  }
  return '';
}

export function buildExecutorOutcome(input: BuildExecutorOutcomeInput): ExecutorOutcome {
  const unfinished = collectUnfinished(input.steps);
  if (input.run.status !== 'completed' && input.terminalNote && !unfinished.includes(input.terminalNote)) {
    unfinished.push(input.terminalNote.slice(0, 500));
  }
  return {
    summary: resolveSummary(input.steps),
    evidence: collectEvidence(input.steps),
    toolCalls: collectToolCalls(input.steps),
    unfinished: unfinished.slice(0, 20),
  };
}
