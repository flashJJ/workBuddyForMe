import { ApiError } from '@wbfm/shared/errors';
import { type AppSettings } from '@wbfm/shared/types';
import { type SettingsUpdateInput } from '@wbfm/shared/schemas';
import {
  createModelRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from './deps';
import {
  CONTEXT_MESSAGES_MAX,
  CONTEXT_MESSAGES_MIN,
  DEFAULT_CONTEXT_MESSAGES,
} from '@wbfm/shared/constants';

const SETTINGS_KEY = 'app-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultChatModelId: null,
  defaultEmbeddingModelId: null,
  theme: 'light',
  // v1.8：品牌默认主题（亮/暗仍由 theme 三态决定）
  themeId: 'stellar',
  language: 'zh-CN',
  // 全新装机默认未引导；老用户由 v016 迁移显式回填 true
  hasOnboarded: false,
  // v1.3 M4：自动编译默认开；LLM 增强默认关（规则通道零模型调用）
  autoCompile: true,
  compileWithLlm: false,
  compileModelId: null,
  // v1.8 M3：上下文条数（2–50）与全局追加提示词默认
  contextMessageCount: DEFAULT_CONTEXT_MESSAGES,
  globalAppendPrompt: '',
  globalAppendPromptEnabled: false,
};

/** 服务端钳制上下文条数：settings_kv 可被手改/旧值污染，越界一律回落默认 */
export function resolveContextMessageCount(value: number | undefined | null): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= CONTEXT_MESSAGES_MIN &&
    value <= CONTEXT_MESSAGES_MAX
    ? value
    : DEFAULT_CONTEXT_MESSAGES;
}

/** 全局追加仅在开关开且内容非空白时生效 */
export function resolveGlobalAppendPrompt(settings: AppSettings): string | null {
  if (settings.globalAppendPromptEnabled !== true) return null;
  const text = settings.globalAppendPrompt?.trim();
  return text ? text : null;
}

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
      const merged = { ...DEFAULT_SETTINGS, ...settings.getJson(SETTINGS_KEY, {}) };
      // 服务端钳制为准：手改 settings_kv 的越界条数不进对话管线
      merged.contextMessageCount = resolveContextMessageCount(merged.contextMessageCount);
      return merged;
    },

    update(patch: SettingsUpdateInput): AppSettings {
      ensureModelExists(patch.defaultChatModelId ?? null, '默认对话模型');
      ensureModelExists(patch.defaultEmbeddingModelId ?? null, '默认嵌入模型');
      ensureModelExists(patch.compileModelId ?? null, '编译增强模型');
      const next = { ...this.get(), ...patch };
      settings.setJson(SETTINGS_KEY, next);
      return next;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
