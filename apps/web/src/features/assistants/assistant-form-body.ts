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
  knowledgeBaseId: string;
  enabledTools: string[];
  retrieveAlways: boolean;
  memoryEnabled: boolean;
  expressionEnabled: boolean;
}

/**
 * 表单状态 → API 请求体。
 * 未关联知识库时自动剔除 knowledge_search，避免后端 422。
 */
export function buildAssistantBody(form: AssistantFormShape): AssistantBody {
  const knowledgeBaseId = form.knowledgeBaseId || null;
  const enabledTools = knowledgeBaseId
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
    knowledgeBaseId,
    enabledTools,
    retrieveAlways: form.retrieveAlways,
    memoryEnabled: form.memoryEnabled,
    expressionEnabled: form.expressionEnabled,
  };
}
