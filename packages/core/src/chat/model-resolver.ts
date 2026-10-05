import { ApiError, type Assistant } from '@wbfm/shared';
import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared';
import {
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { buildProvider } from '../services/provider-adapter';

export interface ResolvedChatTarget {
  provider: ChatProvider;
  model: ProviderModel;
}

const SETTINGS_KEY = 'app-settings';

/**
 * 按模型 id 解析供应商与模型（v0.8：flow llm 节点同样复用，
 * modelId 为 null 时跟随全局默认对话模型）。
 */
export function resolveChatTargetForModelId(
  { db, cipher }: ServiceDepsLike,
  modelId: string | null,
): ResolvedChatTarget {
  const effectiveModelId =
    modelId ||
    createSettingsRepository(db).getJson<{ defaultChatModelId?: string | null }>(SETTINGS_KEY, {})
      .defaultChatModelId ||
    null;
  if (!effectiveModelId) {
    throw new ApiError(
      'VALIDATION_ERROR',
      '未配置对话模型：请在节点或设置中选择默认对话模型',
    );
  }

  const model = createModelRepository(db).findById(effectiveModelId);
  if (!model) throw new ApiError('VALIDATION_ERROR', `对话模型不存在：${effectiveModelId}`);

  const providerRecord = createProviderRepository(db).get(model.providerId);
  if (!providerRecord) throw new ApiError('VALIDATION_ERROR', '模型所属供应商不存在');
  if (!providerRecord.enabled) throw new ApiError('VALIDATION_ERROR', '供应商已停用');

  return { provider: buildProvider(db, cipher, providerRecord), model };
}

/** 仅保留本文件需要的依赖形状（与 ServiceDeps 结构兼容） */
type ServiceDepsLike = Pick<import('../services/deps').ServiceDeps, 'db' | 'cipher'>;

/** 解析实际对话模型：助手绑定优先，否则跟随全局默认 */
export function resolveChatTarget(
  deps: ServiceDeps,
  assistant: Assistant,
): ResolvedChatTarget {
  return resolveChatTargetForModelId(deps, assistant.modelId ?? null);
}
