import type { DatabaseInstance } from '@wbfm/database';
import { createAssistantRepository } from '@wbfm/database';

export const BUILTIN_ASSISTANT = {
  id: 'builtin-general',
  name: '通用助手',
  emoji: '🤖',
  color: '#4f8cff',
  systemPrompt: '你是一个乐于助人的中文私人 AI 助手，请简洁、准确地回答问题。',
} as const;

/** 幂等种子：首次启动创建内置通用助手（固定 id，不可删除） */
export function ensureSeedData(db: DatabaseInstance): void {
  const assistants = createAssistantRepository(db);
  if (assistants.findById(BUILTIN_ASSISTANT.id)) return;
  assistants.create({
    id: BUILTIN_ASSISTANT.id,
    name: BUILTIN_ASSISTANT.name,
    emoji: BUILTIN_ASSISTANT.emoji,
    color: BUILTIN_ASSISTANT.color,
    systemPrompt: BUILTIN_ASSISTANT.systemPrompt,
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    knowledgeBaseId: null,
    enabledTools: [],
    retrieveAlways: false,
    isBuiltin: true,
    sortOrder: 0,
  });
}
