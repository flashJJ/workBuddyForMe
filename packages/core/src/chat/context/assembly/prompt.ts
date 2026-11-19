import { CONTEXT_QUOTA_FACTS } from '@wbfm/shared/constants';
import type { Assistant } from '@wbfm/shared/types';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
import type { TurnIntent } from '@wbfm/shared/schemas';
import { createCharacterCardRepository } from '@wbfm/database';
import type { ServiceDeps } from '../../../services/base/deps';
import type { ConversationService } from '../../../services/assistant/conversation-service';
import type { RecalledMemory } from '../../../memory/memory-service-types';
import { formatConstraintBlock, formatMemoryBlock } from '../../../memory/turn-memory';
import { buildConversationFactsBlock } from '../conversation-facts-block';
import { isLeanTurn } from '../context-plan';
import {
  buildSkillPromptBlock,
  mergeSkillAllowedTools,
  pickAssistantSkills,
} from '../../../skills/skill-assembly';
import { resolveUnlockedNickname } from '../persona-prompt';
import { buildPlanPromptBlock } from '../../../work-plan/plan-prompt';
import { buildCheckpointPromptBlock } from '../../../work-plan/task-checkpoint';
import { displayLevelOf, type EmotionService } from '../../../emotion/index';

/** 情绪状态快照（EmotionState 未从 emotion barrel 导出，用服务读侧签名推导） */
type EmotionStateSnapshot = ReturnType<EmotionService['view']>;

export interface AssemblePromptBlocksParams {
  deps: ServiceDeps;
  assistant: Assistant;
  conversations: ConversationService;
  emotionState: EmotionStateSnapshot | null;
  /** 本轮召回的长期记忆（已排除约束条目的块由本函数处理） */
  recalledMemories: RecalledMemory[];
  contextWindow: number;
  conversationId: string;
  intent: TurnIntent;
  /** v2.0：关系功能是否开启（关闭时不注入等级称呼） */
  relationshipEnabled: boolean;
}

export interface AssembledPromptBlocks {
  memoryBlock: string | null;
  constraintBlock: string | null;
  factsBlock: string | null;
  /** v2.8：目标/计划/待办折叠块（技能裁剪回退时单独重装） */
  planBlock: string;
  /** 技能提示词块（未裁剪时与 planBlock 合并为 combinedBlock） */
  skillBlock: string | null;
  combinedBlock: string | null;
  lean: boolean;
  effectiveAssistant: Assistant;
  card: ParsedCharacterCard | null;
  cardNickname: string | null;
}

/**
 * 回合 system 区块组装：记忆/约束/事实/计划/技能/角色卡/称呼。
 * v4.13 从 turn-context-assembly 拆出，纯读取，不产生事件或写库。
 */
export function assemblePromptBlocks(
  params: AssemblePromptBlocksParams,
): AssembledPromptBlocks {
  const {
    deps,
    assistant,
    conversations,
    emotionState,
    recalledMemories,
    contextWindow,
    conversationId,
    intent,
    relationshipEnabled,
  } = params;

  const memoryBlock = formatMemoryBlock(
    recalledMemories.filter((item) => item.kind !== 'constraint'),
  );
  // v2.26 P1：硬约束与结构化事实独立成块（事实先于摘要注入）
  const constraintBlock = formatConstraintBlock(recalledMemories);
  const checkpoint = deps.workPlans?.activeCheckpoint(conversationId) ?? null;
  const checkpointBlock = checkpoint ? buildCheckpointPromptBlock(checkpoint) : null;
  const factsBlock =
    [
      checkpointBlock,
      buildConversationFactsBlock(
        conversations.listFacts(conversationId),
        Math.floor(contextWindow * CONTEXT_QUOTA_FACTS),
      ),
    ]
      .filter((item): item is string => Boolean(item?.trim()))
      .join('\n\n') || null;

  // v0.6 M3：启用技能——提示词模板注入 system；预绑定工具与助手白名单取并集
  // v2.4 M4：助手级勾选优先（空数组=跟随全局全部启用技能）
  // 轻量回合（高置信寒暄/澄清）：不注入技能提示词与流程工具声明，降低首字前缀
  const lean = isLeanTurn(intent);
  const enabledSkills = lean
    ? []
    : pickAssistantSkills(deps.skills?.getEnabledSkills() ?? [], assistant.skillNames);
  const skillBlock = lean ? null : buildSkillPromptBlock(enabledSkills);
  // v2.8：当前目标 / 计划 / 待办折叠进 system（未批准计划标注待评审）
  const planBlock = deps.workPlans
    ? buildPlanPromptBlock(deps.workPlans.activeContext(conversationId))
    : '';
  const combinedBlock =
    [planBlock, skillBlock].filter((item): item is string => Boolean(item?.trim())).join('\n\n') ||
    null;
  const effectiveAssistant = mergeSkillAllowedTools(assistant, enabledSkills);

  // v1.8：解析助手当前角色卡；悬挂引用（卡已删/旧档残缺）静默回落默认卡，不阻断对话
  const card: ParsedCharacterCard | null = assistant.cardId
    ? createCharacterCardRepository(deps.db).findById(assistant.cardId)?.parsed ?? null
    : null;

  // v2.0：等级称呼组装前闸门——关系功能开启且有已解锁称呼时才入 prompt，
  // 未解锁内容（高等级称呼）永不进 system 段（03 契约 §7.3）。
  const cardNickname =
    relationshipEnabled && card && emotionState
      ? resolveUnlockedNickname(
          card.nicknameByLevel,
          displayLevelOf(emotionState.relationship, emotionState.relation),
        )
      : null;

  return {
    memoryBlock,
    constraintBlock,
    factsBlock,
    planBlock,
    skillBlock,
    combinedBlock,
    lean,
    effectiveAssistant,
    card,
    cardNickname,
  };
}
