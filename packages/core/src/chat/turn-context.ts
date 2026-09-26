import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  HISTORY_MESSAGE_SAFETY_CAP,
  type Assistant,
  type Conversation,
  type Message,
} from '@wbfm/shared';
import {
  traceAsync,
  type ChatMessage,
  type ToolDefinition,
  type TraceHandle,
} from '@wbfm/ai';
import type { RagContext } from './types';
import type { AttachmentService, ResolvedImage } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import { buildChatMessages } from './prompt';
import {
  estimateTokens,
  resolveReserveTokens,
  type HistoryBudgetStats,
} from './context-budget';
import type { ResolvedChatTarget } from './model-resolver';
import { buildImageMap } from './multimodal';
import { toAiContent } from './multimodal';
import { planCompaction, summarizeConversation } from './summarizer';

export interface TurnMessageParams {
  assistant: Assistant;
  /** 时间正序历史（含本轮用户消息；已折叠消息已由调用方排除） */
  history: Message[];
  rag: RagContext | null;
  images: Map<string, ResolvedImage>;
  /** 模型上下文长度（models.context_window）；null 时用兜底预算 */
  contextWindow: number | null;
  toolDefs: ToolDefinition[];
  lastCompletionTokens: number | null;
  /** 已持久化的对话递归摘要（注入 system 区块） */
  summary: string | null;
  /** 回合前召回的长期记忆（注入 system 区块） */
  memoryBlock: string | null;
}

/**
 * v0.5 一轮对话的出站消息装配：
 * 工具声明按 JSON 体积估算并计入预算扣除，再按 token 预算从新到旧装配历史。
 */
export function buildTurnMessages(params: TurnMessageParams): {
  messages: ChatMessage[];
  stats: HistoryBudgetStats | null;
} {
  const { assistant, history, rag, images, contextWindow, toolDefs, lastCompletionTokens,
    summary, memoryBlock } = params;
  return buildChatMessages(assistant, history, rag, images, {
    contextWindow: contextWindow ?? DEFAULT_CONTEXT_TOKEN_BUDGET,
    toolsTokens: toolDefs.length ? estimateTokens(JSON.stringify(toolDefs)) : 0,
    lastCompletionTokens,
    summary,
    memoryBlock,
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

export interface CompactionParams {
  conversations: ConversationService;
  attachments: AttachmentService;
  conversation: Conversation;
  assistant: Assistant;
  target: ResolvedChatTarget;
  toolDefs: ToolDefinition[];
  /** 本轮真实 completion tokens（校准下轮输出预留） */
  lastCompletionTokens: number | null;
  signal?: AbortSignal;
  traceParent: TraceHandle | null;
}

export interface CompactionResult {
  /** 本次新折叠的消息条数；0 表示无需压缩 */
  compactedTurns: number;
  /** 本次写回的（递归合并后）摘要；未压缩为 null */
  summary: string | null;
}

/**
 * v0.5 回合后压缩：基于未折叠历史做压缩决策，触发时把最旧若干轮
 * 递归摘要后写回 conversations.summary/summary_turns，下一轮生效。
 * 任何失败由调用方吞掉并降级为纯截断，本函数不处理 UI 事件。
 */
export async function compactIfNeeded(params: CompactionParams): Promise<CompactionResult> {
  const { conversations, attachments, conversation, assistant, target, toolDefs } = params;
  const unfolded = conversations.recentMessagesAfter(
    conversation.id,
    conversation.summaryTurns,
    HISTORY_MESSAGE_SAFETY_CAP,
  );
  const imageMap = buildImageMap(attachments, unfolded);
  const mapped = unfolded.map(
    (message): ChatMessage => ({ role: message.role, content: toAiContent(message, imageMap) }),
  );

  const plan = planCompaction({
    history: mapped,
    contextWindow: target.model.contextWindow ?? DEFAULT_CONTEXT_TOKEN_BUDGET,
    personaTokens: estimateTokens(assistant.systemPrompt),
    toolsTokens: toolDefs.length ? estimateTokens(JSON.stringify(toolDefs)) : 0,
    reserveTokens: resolveReserveTokens(params.lastCompletionTokens),
    memoryEnabled: assistant.memoryEnabled,
  });
  if (!plan) return { compactedTurns: 0, summary: null };

  const folded = unfolded.slice(0, plan.foldCount);
  const summary = await summarizeConversation({
    target,
    previousSummary: conversation.summary,
    folded,
    signal: params.signal,
    traceParent: params.traceParent,
  });
  conversations.updateSummary(
    conversation.id,
    summary,
    conversation.summaryTurns + plan.foldCount,
  );
  return { compactedTurns: plan.foldCount, summary };
}

/**
 * 回合成功后调用：尝试压缩，任何失败（摘要模型不可用/空结果/网络）都只记日志，
 * 降级为下轮继续 token 截断，绝不影响已完成的回答。
 */
export async function runPostTurnCompaction(
  params: CompactionParams,
): Promise<CompactionResult | null> {
  try {
    return await compactIfNeeded(params);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 对话压缩失败，降级为 token 截断：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
