import type { TaskStepView } from '@wbfm/shared/schemas';
import { estimateTokens } from '../chat/context/context-budget';
import { toModelText } from '../i18n/system-text';

/**
 * v4.7 任务历史 Condenser：
 * 取代 HISTORICAL_STEP_CAP 的硬截断——保留首部（任务起点/首个观察）与最近 K 步，
 * 中段按 token 预算压缩为「省略摘要」；原文仍在 task_steps，可回溯。
 * 纯结构压缩，不调用模型，保证确定性、可单测、失败不影响主循环。
 */

/** 历史步骤入模 token 预算（按字符粗估） */
export const STEP_HISTORY_BUDGET_TOKENS = 1200;
/** 小窗口模型下的历史预算下限（保证首部+最近步仍有线索） */
export const STEP_HISTORY_MIN_TOKENS = 320;
/** 历史预算占模型上下文窗口的比例（与任务上下文各自独立配额） */
export const STEP_HISTORY_WINDOW_RATIO = 0.12;
/** 最近步骤逐条保留数 */
export const STEP_HISTORY_KEEP_RECENT = 8;
/** 首部步骤逐条保留数（任务目标/首个观察） */
export const STEP_HISTORY_KEEP_FIRST = 2;

/**
 * 按模型窗口解析历史步骤预算：
 * 本地小模型（如 Ollama num_ctx=4096）不能用云端 1.2k 的固定配额，
 * 否则系统提示+工具目录+观察一起会顶穿窗口；未知窗口沿用默认预算。
 */
export function resolveStepHistoryBudget(contextWindow: number | null | undefined): number {
  if (!contextWindow || contextWindow <= 0) return STEP_HISTORY_BUDGET_TOKENS;
  return Math.max(
    STEP_HISTORY_MIN_TOKENS,
    Math.min(STEP_HISTORY_BUDGET_TOKENS, Math.floor(contextWindow * STEP_HISTORY_WINDOW_RATIO)),
  );
}

export interface CondenseStepHistoryOptions {
  budgetTokens?: number;
  keepRecent?: number;
  keepFirst?: number;
}

function parseStepResultJson(step: TaskStepView): { summary?: string } {
  if (!step.resultJson) return {};
  try {
    return JSON.parse(step.resultJson) as { summary?: string };
  } catch {
    return {};
  }
}

/** 单步摘要行：步骤号/类型/工具 + 理由 + 结果状态；成功动作补 200 字结果摘要 */
export function formatStepDigest(step: TaskStepView): string {
  const head = `#${step.stepIndex} [${step.kind}]${step.toolName ? ` ${step.toolName}` : ''}`;
  const tail = step.status === 'failed' ? `失败：${toModelText(step.error)}` : step.status;
  const reason = step.reason ? `（${toModelText(step.reason)}）` : '';
  const resultSummary =
    step.kind === 'action' && step.status === 'completed'
      ? parseStepResultJson(step).summary?.slice(0, 200)
      : undefined;
  return `${head}${reason} → ${tail}${resultSummary ? `：${resultSummary}` : ''}`;
}

/** 被省略中段的聚合摘要：工具调用次数与失败数（不编造内容，只做计数） */
function summarizeOmitted(steps: TaskStepView[]): string {
  const counts = new Map<string, number>();
  let failures = 0;
  for (const step of steps) {
    if (step.kind === 'action') {
      const name = step.toolName ?? '未命名工具';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (step.status === 'failed') failures += 1;
  }
  const tools = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name}×${count}`)
    .join('、');
  const detail = [tools, failures > 0 ? `其中失败 ${failures} 步` : ''].filter(Boolean).join('；');
  return `（中间省略 ${steps.length} 步${detail ? `：${detail}` : ''}；原文保留在任务步骤记录中）`;
}

/**
 * 装配历史步骤文本：首部 + 最近 K 步必留，中段在剩余预算内逐条保留，
 * 放不下的聚合成一行省略摘要。返回空数组时给「（暂无）」。
 */
export function condenseStepHistory(
  steps: TaskStepView[],
  options: CondenseStepHistoryOptions = {},
): string {
  if (steps.length === 0) return '（暂无）';
  const budget = options.budgetTokens ?? STEP_HISTORY_BUDGET_TOKENS;
  const keepFirst = Math.max(1, options.keepFirst ?? STEP_HISTORY_KEEP_FIRST);
  const keepRecent = Math.max(1, options.keepRecent ?? STEP_HISTORY_KEEP_RECENT);

  const first = steps.slice(0, keepFirst);
  const recentStart = Math.max(first.length, steps.length - keepRecent);
  const middle = steps.slice(first.length, recentStart);
  const recent = steps.slice(recentStart);

  const firstLines = first.map(formatStepDigest);
  const recentLines = recent.map(formatStepDigest);
  // 最近步骤优先于中段：先扣首部+最近，再给中段分配剩余预算
  let used = estimateTokens([...firstLines, ...recentLines].join('\n'));
  const keptMiddle: string[] = [];
  const omitted: TaskStepView[] = [];
  for (const step of middle) {
    const line = formatStepDigest(step);
    const cost = estimateTokens(line);
    if (used + cost <= budget) {
      keptMiddle.push(line);
      used += cost;
    } else {
      omitted.push(step);
    }
  }

  const blocks = [...firstLines, ...keptMiddle];
  if (omitted.length > 0) blocks.push(summarizeOmitted(omitted));
  blocks.push(...recentLines);
  return blocks.join('\n');
}
