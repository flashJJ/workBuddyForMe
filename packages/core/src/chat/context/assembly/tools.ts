import type { Assistant, Conversation, Message } from '@wbfm/shared/types';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
import type { ContextPlan } from '@wbfm/shared/schemas';
import type { ChatMessage, ToolDefinition } from '@wbfm/ai';
import type { RagContext } from '../../base/types';
import type { ResolvedImage } from '../../../services/assistant/attachment-service';
import type { ToolRuntime } from '../../../tools/tool-runtime';
import { toToolDefinitions, type ToolMap } from '../../../tools/types';
import { needsSkillTrim, type HistoryBudgetStats } from '../context-budget';
import { buildTurnMessages } from '../turn-context';

export interface AssembleTurnMessagesParams {
  runtime: ToolRuntime;
  /** 原始助手（技能裁剪回退时的核心工具集） */
  assistant: Assistant;
  /** 合并技能白名单后的助手 */
  effectiveAssistant: Assistant;
  lean: boolean;
  supportsTools: boolean;
  plan: ContextPlan;
  /** 技能裁剪回退时只保留计划块 */
  planBlock: string;
  history: Message[];
  retrieved: RagContext | null;
  imageMap: Map<string, ResolvedImage>;
  contextWindow: number;
  lastCompletionTokens: number | null;
  conversation: Conversation;
  memoryBlock: string | null;
  constraintBlock: string | null;
  factsBlock: string | null;
  /** 已合并计划块的技能提示词块 */
  skillBlock: string | null;
  emotionBlock: string | null;
  card: ParsedCharacterCard | null;
  globalAppendPrompt: string | null;
  cardNickname: string | null;
}

export interface AssembledTurnMessages {
  outgoing: ChatMessage[];
  budgetStats: HistoryBudgetStats | null;
  /** 最终生效的工具集（技能被裁剪时为助手核心工具集） */
  toolMap: ToolMap;
  toolDefs: ToolDefinition[];
}

/**
 * 工具声明 + 出站消息装配：先按技能增强工具集装一次，
 * 小窗口下原文预算被挤到下限时裁技能再装一次（v4.8.1）。
 */
export function assembleTurnMessages(
  params: AssembleTurnMessagesParams,
): AssembledTurnMessages {
  const build = (map: ToolMap, defs: ToolDefinition[], skillPrompt: string | null) =>
    buildTurnMessages({
      assistant: params.assistant,
      history: params.history,
      rag: params.retrieved,
      images: params.imageMap,
      contextWindow: params.contextWindow,
      toolDefs: defs,
      lastCompletionTokens: params.lastCompletionTokens,
      summary: params.conversation.summary,
      memoryBlock: params.memoryBlock,
      constraintBlock: params.constraintBlock,
      factsBlock: params.factsBlock,
      skillBlock: skillPrompt,
      emotionBlock: params.emotionBlock,
      card: params.card,
      globalAppendPrompt: params.globalAppendPrompt,
      cardNickname: params.cardNickname,
      plan: params.plan,
    });

  const toolMap = params.runtime.buildTools(params.effectiveAssistant, params.supportsTools, {
    includeFlows: !params.lean,
  });
  let built = build(toolMap, toToolDefinitions([...toolMap.values()]), params.skillBlock);
  let activeToolMap = toolMap;
  // v4.8.1：小窗口下原文预算被技能块/技能工具挤到下限以下时，先裁技能再装一次
  if (needsSkillTrim(built.stats)) {
    const coreMap = params.runtime.buildTools(params.assistant, params.supportsTools, {
      includeFlows: !params.lean,
    });
    activeToolMap = coreMap;
    built = build(coreMap, toToolDefinitions([...coreMap.values()]), params.planBlock || null);
  }
  return {
    outgoing: built.messages,
    budgetStats: built.stats,
    toolMap: activeToolMap,
    toolDefs: toToolDefinitions([...activeToolMap.values()]),
  };
}
