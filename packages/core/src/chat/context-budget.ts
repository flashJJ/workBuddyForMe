import type { ChatMessage } from '@wbfm/ai';
import { OUTPUT_RESERVE_TOKENS } from '@wbfm/shared';

/** 用上次真实 completion 校准预留时的加成余量 */
const OUTPUT_RESERVE_MARGIN = 128;

/** 输出预留：优先用上次真实 completion 校准，否则默认预留 */
export function resolveReserveTokens(lastCompletionTokens: number | null): number {
  return lastCompletionTokens != null
    ? Math.max(OUTPUT_RESERVE_TOKENS, lastCompletionTokens + OUTPUT_RESERVE_MARGIN)
    : OUTPUT_RESERVE_TOKENS;
}

/**
 * v0.5 Token 预算估算参数：
 * 无真实 tokenizer 时按字符粗估——中文 ≈1.5 字符/token，非 CJK ≈4 字符/token。
 */
export const CJK_CHARS_PER_TOKEN = 1.5;
export const NON_CJK_CHARS_PER_TOKEN = 4;
/** 单张图片片段的粗略 token 估计（视觉模型按像素计，取保守中值） */
export const IMAGE_TOKEN_ESTIMATE = 512;
/** 每条消息的固定结构开销（role 与分隔符） */
export const PER_MESSAGE_OVERHEAD_TOKENS = 4;

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

/** 按字符估算文本 token 数：CJK 与非 CJK 分别计价 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK_PATTERN)?.length ?? 0;
  const other = text.length - cjk;
  return Math.ceil(cjk / CJK_CHARS_PER_TOKEN + other / NON_CJK_CHARS_PER_TOKEN);
}

/** 估算单条消息 token：文本按字符、图片按固定值、工具调用按 JSON 体积 */
export function estimateMessageTokens(message: ChatMessage): number {
  let tokens = PER_MESSAGE_OVERHEAD_TOKENS;
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      tokens += part.type === 'text' ? estimateTokens(part.text) : IMAGE_TOKEN_ESTIMATE;
    }
  }
  if (message.toolCalls?.length) {
    tokens += estimateTokens(JSON.stringify(message.toolCalls));
  }
  return tokens;
}

/** 一次预算装配的可观测统计（透传 LangSmith context_budget span） */
export interface HistoryBudgetStats {
  [key: string]: unknown;
  contextWindow: number;
  systemTokens: number;
  toolsTokens: number;
  reserveTokens: number;
  historyBudget: number;
  keptMessages: number;
  droppedMessages: number;
  estimatedHistoryTokens: number;
  truncated: boolean;
}

export interface AssembleHistoryInput {
  /** 时间正序的历史消息；最后一条为本轮用户消息，恒保留不裁剪 */
  history: ChatMessage[];
  /** 模型上下文长度（tokens） */
  contextWindow: number;
  /** 系统提示词（含 RAG 资料块）占用 */
  systemTokens: number;
  /** 工具声明占用 */
  toolsTokens: number;
  /** 上一轮真实 completion tokens；null 时使用默认输出预留 */
  lastCompletionTokens: number | null;
}

export interface AssembleHistoryResult {
  /** 装配保留的历史后缀（时间正序） */
  kept: ChatMessage[];
  stats: HistoryBudgetStats;
}

/**
 * 历史消息按 token 预算装配：
 * 预算 = 上下文长度 − system − 工具声明 − 输出预留（优先用上次真实 completion 校准）；
 * 剩余预算从新到旧连续装载，装不下为止；本轮用户消息恒保留。
 */
export function assembleHistoryWithinBudget(
  input: AssembleHistoryInput,
): AssembleHistoryResult {
  const { history, contextWindow, systemTokens, toolsTokens, lastCompletionTokens } = input;
  const reserveTokens = resolveReserveTokens(lastCompletionTokens);
  const historyBudget = Math.max(
    0,
    contextWindow - systemTokens - toolsTokens - reserveTokens,
  );

  const costs = history.map(estimateMessageTokens);
  let used = 0;
  // cutFrom 为保留后缀的起始下标（排他）：history.slice(cutFrom) 即保留部分
  let cutFrom = history.length;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const cost = costs[i]!;
    if (i === history.length - 1) {
      // 本轮用户消息恒保留（即使单独超预算，也保证当前问题不丢）
      used += cost;
      cutFrom = i;
      continue;
    }
    if (used + cost > historyBudget) break;
    used += cost;
    cutFrom = i;
  }

  return {
    kept: history.slice(cutFrom),
    stats: {
      contextWindow,
      systemTokens,
      toolsTokens,
      reserveTokens,
      historyBudget,
      keptMessages: history.length - cutFrom,
      droppedMessages: cutFrom,
      estimatedHistoryTokens: used,
      truncated: cutFrom > 0,
    },
  };
}
