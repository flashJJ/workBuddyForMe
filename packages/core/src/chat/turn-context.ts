import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@wbfm/shared';
import type { Assistant, Message } from '@wbfm/shared';
import { traceAsync, type ChatMessage, type ToolDefinition, type TraceHandle } from '@wbfm/ai';
import type { RagContext } from './types';
import type { ResolvedImage } from '../services/attachment-service';
import { buildChatMessages } from './prompt';
import { estimateTokens, type HistoryBudgetStats } from './context-budget';

export interface TurnMessageParams {
  assistant: Assistant;
  /** 时间正序历史（含本轮用户消息） */
  history: Message[];
  rag: RagContext | null;
  images: Map<string, ResolvedImage>;
  /** 模型上下文长度（models.context_window）；null 时用兜底预算 */
  contextWindow: number | null;
  toolDefs: ToolDefinition[];
  lastCompletionTokens: number | null;
}

/**
 * v0.5 一轮对话的出站消息装配：
 * 工具声明按 JSON 体积估算并计入预算扣除，再按 token 预算从新到旧装配历史。
 */
export function buildTurnMessages(params: TurnMessageParams): {
  messages: ChatMessage[];
  stats: HistoryBudgetStats | null;
} {
  const { assistant, history, rag, images, contextWindow, toolDefs, lastCompletionTokens } = params;
  return buildChatMessages(assistant, history, rag, images, {
    contextWindow: contextWindow ?? DEFAULT_CONTEXT_TOKEN_BUDGET,
    toolsTokens: toolDefs.length ? estimateTokens(JSON.stringify(toolDefs)) : 0,
    lastCompletionTokens,
  });
}

/** 预算装配可观测：LangSmith context_budget span 记录各区块占用与裁剪情况 */
export async function recordBudgetSpan(
  stats: HistoryBudgetStats,
  traceParent: TraceHandle | null,
): Promise<void> {
  await traceAsync(
    { name: 'context_budget', runType: 'chain', parent: traceParent, inputs: stats },
    async () => stats,
  );
}
