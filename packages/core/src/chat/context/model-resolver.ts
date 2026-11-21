import { ApiError } from '@wbfm/shared/errors';
import { type Assistant } from '@wbfm/shared/types';
import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared/types';
import {
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../../services/base/deps';
import { buildProvider } from '../../services/provider/provider-adapter';

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
type ServiceDepsLike = Pick<import('../../services/base/deps').ServiceDeps, 'db' | 'cipher'>;

/**
 * 解析实际对话模型：会话级覆盖 > 助手绑定 > 系统默认（v2.20）。
 * conversationModelId 为 null 时行为与 v2.19 完全一致。
 */
export function resolveChatTarget(
  deps: ServiceDeps,
  assistant: Assistant,
  conversationModelId: string | null = null,
): ResolvedChatTarget {
  return resolveChatTargetForModelId(
    deps,
    conversationModelId ?? assistant.modelId ?? null,
  );
}

/**
 * v4.19：备用模型候选链。
 * 优先级：会话覆盖 → 助手链 → 旧单值；跳过主模型、重复项与不可用模型。
 */
export function resolveFallbackChatTargets(
  deps: ServiceDeps,
  assistant: Assistant,
  primary: ResolvedChatTarget['model'],
  conversationId: string | null = null,
): ResolvedChatTarget[] {
  const settings = createSettingsRepository(deps.db);
  const overrides = settings.getJson<Record<string, string>>(
    'conversation-fallback-models',
    {},
  );
  const override = conversationId && overrides ? overrides[conversationId] : null;
  const ids = override
    ? [override]
    : assistant.fallbackModelIds && assistant.fallbackModelIds.length > 0
      ? assistant.fallbackModelIds
      : assistant.fallbackModelId
        ? [assistant.fallbackModelId]
        : [];

  const seen = new Set<string>([primary.id]);
  const targets: ResolvedChatTarget[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      targets.push(resolveChatTargetForModelId(deps, id));
    } catch (error) {
      console.warn('[chat] 备用模型不可用', id, error);
    }
    if (targets.length >= 3) break;
  }
  return targets;
}

/** v4.18：错误态「换备用模型」——强制解析；未配置时给出可读错误 */
export function resolveForcedFallbackTarget(
  deps: ServiceDeps,
  assistant: Assistant,
  primary: ResolvedChatTarget['model'],
  conversationId: string | null = null,
): ResolvedChatTarget {
  const forced = resolveFallbackChatTargets(deps, assistant, primary, conversationId)[0];
  if (!forced) throw ApiError.validation('未配置可用的备用模型，请先在助手设置中选择');
  return forced;
}
