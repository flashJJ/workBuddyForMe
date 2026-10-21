import type { AssistantBody } from '@/lib/hooks/use-assistants';

/** 助手表单状态（与 AssistantFormDialog 内部表单结构一致） */
export interface AssistantFormShape {
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  /** v1.8：当前选用角色卡 id；'' = 默认卡/原文模式 */
  cardId: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  modelId: string;
  /** v1.5：多选知识库 id */
  knowledgeBaseIds: string[];
  enabledTools: string[];
  /** v2.4 M4：助手级技能 name（空数组=跟随全局已启用技能） */
  skillNames: string[];
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
  const body: AssistantBody = {
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
    skillNames: form.skillNames,
    retrieveAlways: form.retrieveAlways,
    memoryEnabled: form.memoryEnabled,
    expressionEnabled: form.expressionEnabled,
    personalityFrankness: form.personalityFrankness,
    personalityTsundere: form.personalityTsundere,
    personalityShy: form.personalityShy,
    personalityTolerance: form.personalityTolerance,
  };
  // v1.8：选中卡片走卡模式；未选卡时由后端按非空原文自动包 identity 卡，空原文显式回默认卡
  if (form.cardId) {
    body.cardId = form.cardId;
  } else if (!form.systemPrompt.trim()) {
    body.cardId = null;
    body.systemPrompt = '';
  }
  return body;
}
