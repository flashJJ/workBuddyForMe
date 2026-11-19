import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  RESEARCH_DEPTH_DEFAULT,
  RESEARCH_DEPTH_PRESETS,
  TOOL_RESULT_HARD_MULTIPLIER,
  TOOL_RESULT_TOKEN_CAP,
  type ResearchDepth,
} from '@wbfm/shared/constants';
import { CONTEXT_BUDGET_SAFETY_RATIO } from '@wbfm/shared/constants';
import { estimateTokens } from '../../chat/context/context-budget';
import type { ToolResult } from '../types';

/** 工具结果预算下限：小窗口也保留可引用的正文空间（token） */
const TOOL_RESULT_FLOOR_TOKENS = 2_880;

/** 由模型窗口 + 检索深度解析出的单轮限额 */
export interface ToolTurnLimits {
  maxWebSearch: number;
  maxFetch: number;
  perPageChars: number;
  /** 工具结果总预算（token）；超出触发旧结果压缩，而非拒绝 */
  toolResultTokens: number;
  /** 硬保险丝：累计超过此值才拒绝新的联网调用 */
  hardToolResultTokens: number;
}

/** 单轮联网工具预算：同一轮对话 / 同一次流程运行内跨工具轮次累计 */
export interface ToolTurnBudget {
  limits: ToolTurnLimits;
  webSearch: number;
  fetch: number;
  /** 所有工具输出累计 token（估算），用于触发旧结果压缩 */
  toolTokens: number;
}

export function resolveToolTurnLimits(
  contextWindow: number,
  depth: ResearchDepth = RESEARCH_DEPTH_DEFAULT,
): ToolTurnLimits {
  const preset = RESEARCH_DEPTH_PRESETS[depth] ?? RESEARCH_DEPTH_PRESETS[RESEARCH_DEPTH_DEFAULT];
  const window = contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_TOKEN_BUDGET;
  const usableWindow = Math.floor(window * CONTEXT_BUDGET_SAFETY_RATIO);
  const ratioBudget = Math.floor(usableWindow * preset.toolResultRatio);
  const floor = Math.min(
    Math.floor(usableWindow * 0.4),
    TOOL_RESULT_FLOOR_TOKENS,
  );
  const toolResultTokens = Math.min(
    Math.max(ratioBudget, floor),
    TOOL_RESULT_TOKEN_CAP,
  );
  return {
    maxWebSearch: preset.maxWebSearch,
    maxFetch: preset.maxFetch,
    perPageChars: preset.perPageChars,
    toolResultTokens,
    hardToolResultTokens: Math.min(
      toolResultTokens * TOOL_RESULT_HARD_MULTIPLIER,
      TOOL_RESULT_TOKEN_CAP * TOOL_RESULT_HARD_MULTIPLIER,
    ),
  };
}

export function createToolTurnBudget(
  contextWindow: number = DEFAULT_CONTEXT_TOKEN_BUDGET,
  depth: ResearchDepth = RESEARCH_DEPTH_DEFAULT,
): ToolTurnBudget {
  return {
    limits: resolveToolTurnLimits(contextWindow, depth),
    webSearch: 0,
    fetch: 0,
    toolTokens: 0,
  };
}

function budgetResult(reason: string): ToolResult {
  return {
    ok: false,
    output: reason,
    summary: '本轮工具预算已用尽',
    evidence: {
      source: '本地上限',
      coverage: '未执行',
      limitations: [reason],
      capturedAt: new Date().toISOString(),
    },
  };
}

/**
 * 执行前检查：次数上限与硬保险丝返回拒绝结果；软 token 预算不在此拒绝
 * （由旧结果压缩消化），未超返回 null。
 */
export function toolBudgetExceeded(
  budget: ToolTurnBudget,
  toolName: string,
): ToolResult | null {
  if (toolName === 'web_search' && budget.webSearch >= budget.limits.maxWebSearch) {
    return budgetResult(
      `本轮检索次数已达上限（${budget.limits.maxWebSearch} 次），请基于已有搜索结果收敛回答；需要更多资料请让用户下一轮继续，或切换更高的检索深度。`,
    );
  }
  if (toolName === 'fetch_webpage') {
    if (budget.fetch >= budget.limits.maxFetch) {
      return budgetResult(
        `本轮网页抓取次数已达上限（${budget.limits.maxFetch} 个页面），请基于已获取内容收敛回答；需要更多资料请让用户下一轮继续，或切换更高的检索深度。`,
      );
    }
    if (budget.toolTokens >= budget.limits.hardToolResultTokens) {
      return budgetResult(
        '本轮工具结果总量已超出硬上限，请基于已获取内容收敛回答；需要更多资料请让用户下一轮继续。',
      );
    }
  }
  return null;
}

/**
 * 派发前预占次数（同轮并发批次用）：
 * 并发调用在结果返回前无法记账，先占次数，避免一批多个抓取同时越过上限。
 */
export function reserveToolBudget(budget: ToolTurnBudget, toolName: string): void {
  if (toolName === 'web_search') budget.webSearch += 1;
  else if (toolName === 'fetch_webpage') budget.fetch += 1;
}

/** 执行后记账：所有工具输出都计入总量，驱动旧结果压缩 */
export function recordToolBudgetUsage(
  budget: ToolTurnBudget,
  outputText: string,
): void {
  budget.toolTokens += estimateTokens(outputText);
}
