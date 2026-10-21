import type { Assistant } from '@wbfm/shared/types';
import { parseJsonArray } from './common';

export interface AssistantRow {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
  model_id: string | null;
  /** v1.4：协作三角色模型覆盖 */
  planner_model_id: string | null;
  executor_model_id: string | null;
  reviewer_model_id: string | null;
  knowledge_base_ids?: string;
  enabled_tools: string;
  /** v2.4 M4：助手级技能勾选（v034；老库结果集缺列时回落 []） */
  skill_names?: string;
  retrieve_always: number;
  /** v0.5：长期记忆开关（0/1） */
  memory_enabled: number;
  /** v1.0 M3：表情指令开关（0/1） */
  expression_enabled: number;
  /** v1.7：人格四权重（v024；老库结果集缺列时回落 0.5） */
  personality_frankness?: number;
  personality_tsundere?: number;
  personality_shy?: number;
  personality_tolerance?: number;
  /** v1.8：角色卡 id（v026；老库结果集缺列时回落 null） */
  card_id?: string | null;
  is_builtin: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function mapAssistant(row: AssistantRow): Assistant {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    topP: row.top_p,
    maxTokens: row.max_tokens,
    modelId: row.model_id,
    plannerModelId: row.planner_model_id,
    executorModelId: row.executor_model_id,
    reviewerModelId: row.reviewer_model_id,
    knowledgeBaseIds: parseJsonArray<string>(row.knowledge_base_ids ?? '[]'),
    enabledTools: parseJsonArray<string>(row.enabled_tools),
    skillNames: parseJsonArray<string>(row.skill_names ?? '[]'),
    retrieveAlways: row.retrieve_always === 1,
    memoryEnabled: row.memory_enabled !== 0,
    expressionEnabled: row.expression_enabled !== 0,
    personalityFrankness: row.personality_frankness ?? 0.5,
    personalityTsundere: row.personality_tsundere ?? 0.5,
    personalityShy: row.personality_shy ?? 0.5,
    personalityTolerance: row.personality_tolerance ?? 0.5,
    cardId: row.card_id ?? null,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
