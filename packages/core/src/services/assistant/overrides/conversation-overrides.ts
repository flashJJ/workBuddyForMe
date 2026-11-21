import { ApiError } from '@wbfm/shared/errors';
import type { Conversation } from '@wbfm/shared/types';
import type { createModelRepository, createSettingsRepository } from '@wbfm/database';

type SettingsRepo = ReturnType<typeof createSettingsRepository>;
type ModelRepo = ReturnType<typeof createModelRepository>;

const BUDGET_KEY = 'conversation-token-budgets';
const FALLBACK_KEY = 'conversation-fallback-models';

/**
 * v4.18/v4.19：会话级覆盖（token 预算、备用模型）统一存 settings_kv，零迁移。
 */
export function createConversationOverrides(settings: SettingsRepo, models: ModelRepo) {
  const readBudgets = (): Record<string, number> => {
    const raw = settings.getJson<unknown>(BUDGET_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const map: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) map[key] = value;
    }
    return map;
  };

  const readFallbackOverrides = (): Record<string, string> => {
    const raw = settings.getJson<unknown>(FALLBACK_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value) map[key] = value;
    }
    return map;
  };

  const writeFallbackOverride = (conversationId: string, modelId: string | null): void => {
    const map = readFallbackOverrides();
    if (modelId) map[conversationId] = modelId;
    else delete map[conversationId];
    settings.setJson(FALLBACK_KEY, map);
  };

  const setBudget = (conversationId: string, tokenBudget: number | null): void => {
    const budgets = readBudgets();
    if (tokenBudget === null) delete budgets[conversationId];
    else budgets[conversationId] = tokenBudget;
    settings.setJson(BUDGET_KEY, budgets);
  };

  const withOverrides = (
    conversation: Conversation,
    budgets = readBudgets(),
    fallbacks = readFallbackOverrides(),
  ): Conversation => ({
    ...conversation,
    tokenBudget: budgets[conversation.id] ?? null,
    fallbackModelId: fallbacks[conversation.id] ?? null,
  });

  const validateFallbackOverride = (modelId: string | null): void => {
    if (!modelId) return;
    const model = models.findById(modelId);
    if (!model) throw ApiError.validation(`备用模型不存在：${modelId}`);
    if (!model.capabilities.includes('chat')) {
      throw ApiError.validation('备用模型必须支持对话能力');
    }
  };

  return {
    readBudgets,
    readFallbackOverrides,
    writeFallbackOverride,
    setBudget,
    withOverrides,
    validateFallbackOverride,
  };
}
