import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  HISTORY_MESSAGE_SAFETY_CAP,
} from '@wbfm/shared/constants';
import type { Assistant, Citation, Conversation, ToolTraceEntry } from '@wbfm/shared/types';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
import type { ChatMessage, ToolDefinition, TraceHandle } from '@wbfm/ai';
import { createCharacterCardRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import type { AttachmentService } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import type { MemoryService } from '../memory/memory-service';
import { formatMemoryBlock, safeRecallEvent } from '../memory/turn-memory';
import { buildImageMap } from './multimodal';
import { buildTurnMessages, recordBudgetSpan, applyContextMessageCap } from './turn-context';
import { resolveToolMessageBudget } from './context-budget';
import type { OrchestratorEvent, RagContext } from './types';
import type { ResolvedChatTarget } from './model-resolver';
import type { ToolRuntime } from '../tools/tool-runtime';
import { toToolDefinitions, type ToolContext, type ToolMap } from '../tools/types';
import { buildSkillPromptBlock, mergeSkillAllowedTools } from '../skills/skill-assembly';
import { createSettingsService, resolveGlobalAppendPrompt } from '../services/settings-service';
import {
  buildEmotionStateBlock,
  EMOTION_DIRECTIVE_BLOCK,
  type EmotionService,
} from '../emotion';

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
    emotion,
  } = params;

  // v1.6：情绪功能双开关——app-settings.emotionEnabled（缺省 true）与
  // 助手 expressionEnabled 同时为真，且情绪服务已注入时才注入情绪段。
  // v1.8 M3：同一处读上下文条数与全局追加（管线参数与系统级追加）。
  const appSettings = createSettingsService(deps).get();
  const emotionEnabled =
    emotion !== undefined &&
    assistant.expressionEnabled &&
    appSettings.emotionEnabled !== false;
  const emotionBlock =
    emotionEnabled && emotion
      ? `${buildEmotionStateBlock(emotion.view(assistant.id))}\n\n${EMOTION_DIRECTIVE_BLOCK}`
      : null;
  const globalAppendPrompt = resolveGlobalAppendPrompt(appSettings);

  const conversation = conversations.get(conversationId);
  const fetchedHistory = conversations
    .recentMessagesAfter(conversationId, conversation.summaryTurns, HISTORY_MESSAGE_SAFETY_CAP)
    .filter((m) => m.id !== assistantMessageId);
  // v1.8 M3：先条数钳制（2–50，服务端为准），再交 token 预算双保险裁剪
  const history = applyContextMessageCap(fetchedHistory, appSettings.contextMessageCount);
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

  // v1.8：解析助手当前角色卡；悬挂引用（卡已删/旧档残缺）静默回落默认卡，不阻断对话
  const card: ParsedCharacterCard | null = assistant.cardId
    ? createCharacterCardRepository(deps.db).findById(assistant.cardId)?.parsed ?? null
    : null;

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
    emotionBlock,
    card,
    globalAppendPrompt,
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
    emotionEnabled,
    toolMessageBudgetTokens,
    trace,
    citations,
  };
}
