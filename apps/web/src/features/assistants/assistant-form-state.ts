import type { Assistant } from '@wbfm/shared/types';
import type { AssistantFormShape } from './assistant-form-body';

/** 新建助手时的表单默认值（含默认勾选 current_time 与记忆/表情开关） */
export function emptyAssistantForm(): AssistantFormShape {
  return {
    name: '',
    emoji: '🤖',
    color: '#6366f1',
    systemPrompt: '',
    temperature: '1',
    topP: '1',
    maxTokens: '',
    modelId: '',
    knowledgeBaseId: '',
    enabledTools: ['current_time'],
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: true,
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
    temperature: String(assistant.temperature),
    topP: String(assistant.topP),
    maxTokens: assistant.maxTokens ? String(assistant.maxTokens) : '',
    modelId: assistant.modelId ?? '',
    knowledgeBaseId: assistant.knowledgeBaseId ?? '',
    enabledTools: [...assistant.enabledTools],
    retrieveAlways: assistant.retrieveAlways,
    memoryEnabled: assistant.memoryEnabled,
    expressionEnabled: assistant.expressionEnabled,
  };
}
