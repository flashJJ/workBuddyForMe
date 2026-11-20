import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';

/** 设置 JSON 的存储键（与 settings-service 保持一致） */
const SETTINGS_KEY = 'app-settings';

/** 设置中可能指向模型的默认绑定键 */
const DEFAULT_MODEL_KEYS = [
  'defaultChatModelId',
  'defaultEmbeddingModelId',
  'compileModelId',
] as const;

/**
 * 删除模型/供应商后清理设置里的悬空默认绑定。
 *
 * assistants.model_id / conversations.model_id 有外键 ON DELETE SET NULL，
 * 但设置存的是 JSON（无外键），不清理会让新对话报「对话模型不存在：<uuid>」，
 * 用户必须手动重新选择默认模型才能恢复。
 */
export function clearDefaultModelReferences(
  db: DatabaseInstance,
  removedModelIds: readonly string[],
): void {
  if (removedModelIds.length === 0) return;
  const removed = new Set(removedModelIds);
  const repo = createSettingsRepository(db);
  const current = repo.getJson<Record<string, unknown>>(SETTINGS_KEY, {});
  const next = { ...current };
  let changed = false;
  for (const key of DEFAULT_MODEL_KEYS) {
    const value = next[key];
    if (typeof value === 'string' && removed.has(value)) {
      next[key] = null;
      changed = true;
    }
  }
  if (changed) repo.setJson(SETTINGS_KEY, next);
}
