import type { Assistant } from '@wbfm/shared/types';
import type { AssistantFormShape } from './assistant-form-body';

/** 新建助手时的表单默认值（含默认勾选 current_time 与记忆/表情开关） */
export function emptyAssistantForm(): AssistantFormShape {
  return {
    name: '',
    emoji: '🤖',
    color: '#6366f1',
    systemPrompt: '',
    cardId: '',
    temperature: '1',
    topP: '1',
    maxTokens: '',
    modelId: '',
    knowledgeBaseIds: [],
    enabledTools: ['current_time'],
    skillNames: [],
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: true,
    personalityFrankness: 0.5,
    personalityTsundere: 0.5,
    personalityShy: 0.5,
    personalityTolerance: 0.5,
  };
}

/** 助手实体 → 表单状态（无实体时给新建默认值）；受控字段全部逐字段映射 */
export function toForm(assistant: Assistant | null | undefined): AssistantFormShape {
  if (!assistant) return emptyAssistantForm();
  return {
    name: assistant.name,
    emoji: assistant.emoji ?? '',
    color: assistant.color ?? '#6366f1',
    systemPrompt: assistant.systemPrompt,
    cardId: assistant.cardId ?? '',
    temperature: String(assistant.temperature),
    topP: String(assistant.topP),
    maxTokens: assistant.maxTokens ? String(assistant.maxTokens) : '',
    modelId: assistant.modelId ?? '',
    knowledgeBaseIds: [...assistant.knowledgeBaseIds],
    enabledTools: [...assistant.enabledTools],
    skillNames: [...assistant.skillNames],
    retrieveAlways: assistant.retrieveAlways,
    memoryEnabled: assistant.memoryEnabled,
    expressionEnabled: assistant.expressionEnabled,
    personalityFrankness: assistant.personalityFrankness,
    personalityTsundere: assistant.personalityTsundere,
    personalityShy: assistant.personalityShy,
    personalityTolerance: assistant.personalityTolerance,
  };
}

/** v2.4 P0-2：模板卡「以此开始」的预填值（角色卡 + 可选知识库 + 可选技能） */
export interface AssistantPreset {
  name: string;
  cardId: string | null;
  knowledgeBaseIds: string[];
  /** v2.4 M4：预设绑定的技能（P1-2 接线后生效） */
  skillNames?: string[];
}

/** 预填 → 新建表单默认值：预置名称、角色卡、关联知识库与技能 */
export function presetToForm(preset: AssistantPreset): AssistantFormShape {
  const base = emptyAssistantForm();
  const knowledgeBaseIds = [...preset.knowledgeBaseIds];
  return {
    ...base,
    name: preset.name,
    cardId: preset.cardId ?? '',
    knowledgeBaseIds,
    skillNames: [...(preset.skillNames ?? [])],
    enabledTools:
      knowledgeBaseIds.length > 0 ? [...base.enabledTools, 'knowledge_search'] : base.enabledTools,
  };
}
