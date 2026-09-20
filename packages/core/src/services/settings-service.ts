import { ApiError, type AppSettings, type SettingsUpdateInput } from '@wbfm/shared';
import { createModelRepository, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from './deps';

const SETTINGS_KEY = 'app-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultChatModelId: null,
  defaultEmbeddingModelId: null,
  theme: 'light',
  language: 'zh-CN',
};

export function createSettingsService({ db }: ServiceDeps) {
  const settings = createSettingsRepository(db);
  const models = createModelRepository(db);

  const ensureModelExists = (id: string | null, label: string) => {
    if (id !== null && !models.findById(id)) {
      throw ApiError.validation(`${label}不存在：${id}`);
    }
  };

  return {
    get(): AppSettings {
      return { ...DEFAULT_SETTINGS, ...settings.getJson(SETTINGS_KEY, {}) };
    },

    update(patch: SettingsUpdateInput): AppSettings {
      ensureModelExists(patch.defaultChatModelId ?? null, '默认对话模型');
      ensureModelExists(patch.defaultEmbeddingModelId ?? null, '默认嵌入模型');
      const next = { ...this.get(), ...patch };
      settings.setJson(SETTINGS_KEY, next);
      return next;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
