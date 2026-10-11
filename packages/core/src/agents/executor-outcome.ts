import { AGENT_LIMITS, type ExecutorOutcome } from '@wbfm/shared/schemas';
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import type { Citation } from '@wbfm/shared/types';
import { parseSystemMessage } from '@wbfm/shared/i18n';
import { sys } from '../i18n/system-text';

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

/**
 * 终态兜底说明：决策连续失败/熔断/急停时没有 final 步也没有成功动作，
 * summary 绝不能空——executorOutcomeSchema 要求 min(1)，空串会让 executor→reviewer
 * 交接以「非法交接载荷」整体失败，真实原因（如模型通道 403）反被吞掉。
 */
const FALLBACK_TERMINAL_SUMMARY = sys('agentTrace.terminal.noConclusion');

/**
 * unfinished 项长度限制：纯系统消息标记不可切断（会破坏 STX 定界导致解码失败），
 * 生产端已保证标记串远短于 500；普通文本按 schema 上限截断。
 */
function clipUnfinishedItem(text: string): string {
  if (parseSystemMessage(text)) return text;
  return text.slice(0, 500);
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
    unfinished.push(clipUnfinishedItem(input.terminalNote));
  }
  const resolved = resolveSummary(input.steps);
  const summary = resolved
    ? clipSummary(resolved)
    : clipSummary(input.terminalNote?.trim() || FALLBACK_TERMINAL_SUMMARY);
  return {
    summary,
    evidence: collectEvidence(input.steps),
    toolCalls: collectToolCalls(input.steps),
    unfinished: unfinished.slice(0, 20),
  };
}
