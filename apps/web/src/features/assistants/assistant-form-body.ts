import type { AssistantBody } from '@/lib/hooks/use-assistants';

/** 助手表单状态（与 AssistantFormDialog 内部表单结构一致） */
export interface AssistantFormShape {
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  modelId: string;
  /** v1.5：多选知识库 id */
  knowledgeBaseIds: string[];
  enabledTools: string[];
  retrieveAlways: boolean;
  memoryEnabled: boolean;
  expressionEnabled: boolean;
  /** v1.7：人格四权重 0..1 */
  personalityFrankness: number;
  personalityTsundere: number;
  personalityShy: number;
  personalityTolerance: number;
}

/**
 * 表单状态 → API 请求体。
 * 未关联任何知识库时自动剔除 knowledge_search，避免后端 422。
 */
export function buildAssistantBody(form: AssistantFormShape): AssistantBody {
  const knowledgeBaseIds = form.knowledgeBaseIds;
  const enabledTools =
    knowledgeBaseIds.length > 0
      ? form.enabledTools
      : form.enabledTools.filter((t) => t !== 'knowledge_search');
  return {
    name: form.name.trim(),
    emoji: form.emoji.trim() || null,
    color: form.color || null,
    systemPrompt: form.systemPrompt,
    temperature: Number(form.temperature),
    topP: Number(form.topP),
    maxTokens: form.maxTokens ? Number(form.maxTokens) : null,
    modelId: form.modelId || null,
    knowledgeBaseIds,
    enabledTools,
    retrieveAlways: form.retrieveAlways,
    memoryEnabled: form.memoryEnabled,
    expressionEnabled: form.expressionEnabled,
    personalityFrankness: form.personalityFrankness,
    personalityTsundere: form.personalityTsundere,
    personalityShy: form.personalityShy,
    personalityTolerance: form.personalityTolerance,
  };
}
