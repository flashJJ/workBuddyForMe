import type { Assistant, Provider, ProviderModel } from '@wbfm/shared/types';

/** 对话页测试共享夹具：避免多个测试文件各自维护同一份最小实体 */
export const ASSISTANT: Assistant = {
  id: 'a1',
  name: '通用助手',
  emoji: '🤖',
  color: null,
  systemPrompt: '',
  temperature: 1,
  topP: 1,
  maxTokens: null,
  modelId: null,
  plannerModelId: null,
  executorModelId: null,
  reviewerModelId: null,
  knowledgeBaseIds: [],
  enabledTools: [],
  skillNames: [],
  retrieveAlways: false,
  memoryEnabled: true,
  expressionEnabled: true,
  personalityFrankness: 0.5,
  personalityTsundere: 0.5,
  personalityShy: 0.5,
  personalityTolerance: 0.5,
  cardId: null,
  stagePlan: null,
  isBuiltin: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

export const PROVIDER: Provider = {
  id: 'p1',
  name: 'P',
  protocol: 'openai-compatible',
  baseUrl: 'https://x/v1',
  apiKeyMasked: null,
  enabled: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

export const MODEL: ProviderModel = {
  id: 'm1',
  providerId: 'p1',
  modelId: 'gpt-mini',
  displayName: 'GPT mini',
  capabilities: ['chat'],
  contextWindow: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};
