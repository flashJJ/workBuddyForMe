import { RESEARCH_DEPTH_DEFAULT, type ResearchDepth } from '@wbfm/shared/constants';
import type { Assistant, Citation, Conversation, ToolTraceEntry } from '@wbfm/shared/types';
import type { TurnIntent } from '@wbfm/shared/schemas';
import type { ChatMessage, ToolDefinition, TraceHandle } from '@wbfm/ai';
import type { ServiceDeps } from '../../services/base/deps';
import type { AttachmentService } from '../../services/assistant/attachment-service';
import type { ConversationService } from '../../services/assistant/conversation-service';
import type { MemoryService } from '../../memory/memory-service';
import { safeRecallEvent } from '../../memory/turn-memory';
import { resolveEffectiveContextWindow } from './window/effective-window';
import { buildContextPlan, isChitchatFastPath } from './context-plan';
import { resolveToolMessageBudget } from './context-budget';
import { resolveToolTurnLimits } from '../../tools/budget/turn-budget';
import type { OrchestratorEvent, RagContext } from '../base/types';
import type { ResolvedChatTarget } from './model-resolver';
import type { ToolRuntime } from '../../tools/tool-runtime';
import type { ToolContext, ToolMap } from '../../tools/types';
import { createSettingsService, resolveGlobalAppendPrompt } from '../../services/settings/settings-service';
import {
  buildEmotionStateBlock,
  EMOTION_DIRECTIVE_BLOCK,
  type EmotionService,
} from '../../emotion/index';
import { loadTurnHistory } from './assembly/history';
import { assemblePromptBlocks } from './assembly/prompt';
import { assembleTurnMessages } from './assembly/tools';
import { recordBudgetSpan } from './turn-context';

export interface PrepareTurnContextParams {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  assistant: Assistant;
  conversations: ConversationService;
  attachments: Pick<AttachmentService, 'loadImages'>;
  memory: MemoryService;
  /** v1.6：情绪服务（读当前情绪/关系状态）；未提供时本轮不注入情绪段 */
  emotion?: EmotionService;
  conversationId: string;
  assistantMessageId: string;
  userContent: string;
  retrieved: RagContext | null;
  /** v4.8：本轮意图（由编排器规则识别，装配据此分配块配额） */
  intent: TurnIntent;
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
  /**
   * v1.6：本轮情绪功能是否生效（总开关 && 助手表情开关 && 情绪服务可用）。
   * 编排器据此决定回复后是否解析尾块/记录情绪；仅装配时计算一次。
   */
  emotionEnabled: boolean;
  /** v1.1：每条工具消息的入模 token 预算（context-budget 装配时下发） */
  toolMessageBudgetTokens: number;
  /** v4.11：本轮生效的检索深度（工具结果预算按档位缩放） */
  researchDepth: ResearchDepth;
  contextWindow: number;
  /** 工具调用追踪（交由工具循环 push 条目） */
  trace: ToolTraceEntry[];
  citations: Citation[];
  /** v4.20：本轮是否命中寒暄快路径（收尾据此跳过回合后记忆提取） */
  fastChitchat: boolean;
}

/**
 * 回合上下文装配：历史/记忆召回（yield memories）→ 技能注入 → 工具声明/预算 → 出站消息。
 * v4.13：历史、system 区块与工具/消息装配下沉到 assembly/ 子模块。
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
    intent,
    signal,
    traceParent,
    target,
    emotion,
  } = params;

  // v1.6：情绪双开关（app-settings + 助手表情开关）且服务已注入时才加情绪段。
  const appSettings = createSettingsService(deps).get();
  // v4.11：生效窗口与检索深度决定工具结果预算
  const contextWindow = resolveEffectiveContextWindow(target.model).effective;
  const researchDepth: ResearchDepth =
    appSettings.searchSettings?.researchDepth ?? RESEARCH_DEPTH_DEFAULT;
  const emotionEnabled =
    emotion !== undefined &&
    assistant.expressionEnabled &&
    appSettings.emotionEnabled !== false;
  // v2.0：关系等级独立于情绪协议开关——情绪关而养成开时，等级与称呼仍可读
  const relationshipEnabled = appSettings.relationshipEnabled !== false;
  const emotionState = emotion ? emotion.view(assistant.id) : null;
  const emotionBlock =
    emotionEnabled && emotionState
      ? `${buildEmotionStateBlock(emotionState)}\n\n${EMOTION_DIRECTIVE_BLOCK}`
      : null;
  const globalAppendPrompt = resolveGlobalAppendPrompt(appSettings);

  const loaded = await loadTurnHistory({
    deps,
    conversations,
    attachments,
    assistant,
    target,
    conversationId,
    assistantMessageId,
    intent,
    contextMessageCount: appSettings.contextMessageCount,
    preflightEnabled: appSettings.contextPreflightCompactEnabled !== false,
    signal,
    traceParent,
  });
  const activeConversation = loaded.conversation;
  // v4.19：高置信寒暄 + 短文本 + 无附件走快路径，跳过工具声明与记忆召回
  const fastChitchat = isChitchatFastPath(userContent, intent, loaded.imageMap.size > 0);

  // v0.5 M3：长期记忆召回（按助手开关门控，失败静默，命中时下发 memories 事件）
  const recalledMemories = assistant.memoryEnabled && !fastChitchat
    ? yield* safeRecallEvent({
        memory,
        query: userContent,
        assistantId: assistant.id,
        conversationId,
        signal,
        traceParent,
      })
    : [];

  const blocks = assemblePromptBlocks({
    deps,
    assistant,
    conversations,
    emotionState,
    recalledMemories,
    contextWindow,
    conversationId,
    intent,
    relationshipEnabled,
  });

  // v4.8：意图 → 块配额（低置信度回落默认，保持旧行为）
  const plan = buildContextPlan({
    intent,
    contextWindow,
    estimatedHistoryTokens: loaded.historyEstimate,
  });
  const lastCompletionTokens =
    conversations.lastAssistantUsage(conversationId)?.completionTokens ?? null;
  const assembled = assembleTurnMessages({
    runtime,
    assistant,
    effectiveAssistant: blocks.effectiveAssistant,
    lean: blocks.lean,
    supportsTools: target.provider.supportsTools && !fastChitchat,
    plan,
    planBlock: blocks.planBlock,
    history: loaded.history,
    retrieved: retrieved ?? null,
    imageMap: loaded.imageMap,
    contextWindow,
    lastCompletionTokens,
    conversation: activeConversation,
    memoryBlock: blocks.memoryBlock,
    constraintBlock: blocks.constraintBlock,
    factsBlock: blocks.factsBlock,
    skillBlock: blocks.combinedBlock,
    emotionBlock,
    card: blocks.card,
    globalAppendPrompt,
    cardNickname: blocks.cardNickname,
  });
  const { outgoing, budgetStats } = assembled;
  if (budgetStats) {
    await recordBudgetSpan(budgetStats, traceParent);
    // v4.8：本地上下文快照（只存 token 统计，不存正文）
    deps.events?.recordChat(conversationId, 'context_snapshot', {
      intent,
      fastChitchat,
      contextWindow,
      usableWindow: budgetStats.contextWindow,
      systemTokens: budgetStats.systemTokens,
      toolsTokens: budgetStats.toolsTokens,
      reserveTokens: budgetStats.reserveTokens,
      historyBudget: budgetStats.historyBudget,
      historyTokens: budgetStats.estimatedHistoryTokens,
      keptMessages: budgetStats.keptMessages,
      droppedMessages: budgetStats.droppedMessages,
      truncated: budgetStats.truncated,
    });
  }
  // v0.7 M1：向工具上下文透传视觉能力（screen_snapshot 据此决定是否携带截图图片）
  const toolCtx = runtime.createContext(assistant, signal, {
    visionCapable: target.model.capabilities.includes('vision'),
    conversationId,
    webFetchMaxBytes: appSettings.searchSettings?.fetchMaxBytes,
    // v4.11：首块正文长度跟随检索深度（read_fetched 续读也用同一尺寸）
    webFetchFirstChunkChars: resolveToolTurnLimits(contextWindow, researchDepth).perPageChars,
  });
  // v1.1：工具结果入模预算按本轮模型窗口装配下发（压缩器不读全局状态）
  const toolMessageBudgetTokens = resolveToolMessageBudget(contextWindow);
  const trace: ToolTraceEntry[] = [];
  const citations = retrieved?.citations ?? [];

  return {
    conversation: activeConversation,
    toolMap: assembled.toolMap,
    toolDefs: assembled.toolDefs,
    outgoing,
    toolCtx,
    emotionEnabled,
    toolMessageBudgetTokens,
    researchDepth,
    contextWindow,
    trace,
    citations,
    fastChitchat,
  };
}
