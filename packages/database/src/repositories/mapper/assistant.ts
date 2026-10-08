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
  knowledge_base_id: string | null;
  enabled_tools: string;
  retrieve_always: number;
  /** v0.5：长期记忆开关（0/1） */
  memory_enabled: number;
  /** v1.0 M3：表情指令开关（0/1） */
  expression_enabled: number;
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
    knowledgeBaseId: row.knowledge_base_id,
    enabledTools: parseJsonArray<string>(row.enabled_tools),
    retrieveAlways: row.retrieve_always === 1,
    memoryEnabled: row.memory_enabled !== 0,
    expressionEnabled: row.expression_enabled !== 0,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
