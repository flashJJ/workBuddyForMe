import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  HISTORY_MESSAGE_SAFETY_CAP,
} from '@wbfm/shared/constants';
import type { Assistant, Citation, Conversation, ToolTraceEntry } from '@wbfm/shared/types';
import type { ChatMessage, ToolDefinition, TraceHandle } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import type { AttachmentService } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import type { MemoryService } from '../memory/memory-service';
import { formatMemoryBlock, safeRecallEvent } from '../memory/turn-memory';
import { buildImageMap } from './multimodal';
import { buildTurnMessages, recordBudgetSpan } from './turn-context';
import { resolveToolMessageBudget } from './context-budget';
import type { OrchestratorEvent, RagContext } from './types';
import type { ResolvedChatTarget } from './model-resolver';
import type { ToolRuntime } from '../tools/tool-runtime';
import { toToolDefinitions, type ToolContext, type ToolMap } from '../tools/types';
import { buildSkillPromptBlock, mergeSkillAllowedTools } from '../skills/skill-assembly';

export interface PrepareTurnContextParams {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  assistant: Assistant;
  conversations: ConversationService;
  attachments: Pick<AttachmentService, 'loadImages'>;
  memory: MemoryService;
  conversationId: string;
  assistantMessageId: string;
  userContent: string;
  retrieved: RagContext | null;
  signal?: AbortSignal;
  traceParent: TraceHandle | null;
  target: ResolvedChatTarget;
}

export interface PreparedTurnContext {
  conversation: Conversation;
  toolMap: ToolMap;
  toolDefs: ToolDefinition[];
  outgoing: ChatMessage[];
  toolCtx: ToolContext;
  /** v1.1：每条工具消息的入模 token 预算（context-budget 装配时下发） */
  toolMessageBudgetTokens: number;
  /** 工具调用追踪（交由工具循环 push 条目） */
  trace: ToolTraceEntry[];
  citations: Citation[];
}

/**
 * 回合上下文装配（纯编排片段，逐字平移自 chat-orchestrator）：
 * 历史/图片 → 长期记忆召回（yield memories 事件）→ 技能注入 →
 * 工具声明/预算扣除 → 出站消息与工具结果预算。
 */
export async function* prepareTurnContext(
  params: PrepareTurnContextParams,
): AsyncGenerator<OrchestratorEvent, PreparedTurnContext> {
  const {
    deps,
    runtime,
    assistant,
    conversations,
    attachments,
    memory,
    conversationId,
    assistantMessageId,
    userContent,
    retrieved,
    signal,
    traceParent,
    target,
  } = params;

  const conversation = conversations.get(conversationId);
  const history = conversations
    .recentMessagesAfter(conversationId, conversation.summaryTurns, HISTORY_MESSAGE_SAFETY_CAP)
    .filter((m) => m.id !== assistantMessageId);
  // 历史图片（含本轮新图与重生成旧图）解析为 data URL
  const imageMap = buildImageMap(attachments, history);

  // v0.5 M3：长期记忆召回（按助手开关门控，失败静默，命中时下发 memories 事件）
  const recalledMemories = assistant.memoryEnabled
    ? yield* safeRecallEvent({
        memory,
        query: userContent,
        signal,
        traceParent,
      })
    : [];
  const memoryBlock = formatMemoryBlock(recalledMemories);

  // v0.6 M3：启用技能——提示词模板注入 system；预绑定工具与助手白名单取并集
  const enabledSkills = deps.skills?.getEnabledSkills() ?? [];
  const skillBlock = buildSkillPromptBlock(enabledSkills);
  const effectiveAssistant = mergeSkillAllowedTools(assistant, enabledSkills);

  // v0.5：先备好工具声明（计入预算扣除），再按 token 预算装配出站消息
  const toolMap = runtime.buildTools(effectiveAssistant, target.provider.supportsTools);
  const toolDefs = toToolDefinitions([...toolMap.values()]);
  const { messages: outgoing, stats: budgetStats } = buildTurnMessages({
    assistant,
    history,
    rag: retrieved ?? null,
    images: imageMap,
    contextWindow: target.model.contextWindow,
    toolDefs,
    lastCompletionTokens:
      conversations.lastAssistantUsage(conversationId)?.completionTokens ?? null,
    summary: conversation.summary,
    memoryBlock,
    skillBlock,
  });
  if (budgetStats) await recordBudgetSpan(budgetStats, traceParent);
  // v0.7 M1：向工具上下文透传视觉能力（screen_snapshot 据此决定是否携带截图图片）
  const toolCtx = runtime.createContext(assistant, signal, {
    visionCapable: target.model.capabilities.includes('vision'),
  });
  // v1.1：工具结果入模预算按本轮模型窗口装配下发（压缩器不读全局状态）
  const toolMessageBudgetTokens = resolveToolMessageBudget(
    target.model.contextWindow ?? DEFAULT_CONTEXT_TOKEN_BUDGET,
  );
  const trace: ToolTraceEntry[] = [];
  const citations = retrieved?.citations ?? [];

  return {
    conversation,
    toolMap,
    toolDefs,
    outgoing,
    toolCtx,
    toolMessageBudgetTokens,
    trace,
    citations,
  };
}
