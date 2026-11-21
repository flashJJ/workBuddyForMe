import { ApiError } from '@wbfm/shared/errors';
import { type Assistant } from '@wbfm/shared/types';
import { type AssistantCreateInput, type AssistantUpdateInput } from '@wbfm/shared/schemas';
import {
  createAssistantRepository,
  createCharacterCardRepository,
  createKnowledgeRepository,
  createModelRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../base/deps';
import { ensureSeedData } from '../base/seed';
import { validateStagePlanBindings } from '../../work-plan/stage-plan-service';
import { buildIdentityCardMarkdown, parseWrappedPrompt } from './persona-card';

export function createAssistantsService(deps: ServiceDeps) {
  const { db } = deps;
  ensureSeedData(db);
  const assistants = createAssistantRepository(db);
  const models = createModelRepository(db);
  const knowledgeBases = createKnowledgeRepository(db);
  const cards = createCharacterCardRepository(db);
  const settings = createSettingsRepository(db);

  /** v4.18：备用模型存 settings_kv（零迁移），键为助手 id */
  const FALLBACK_KEY = 'assistant-fallback-models';
  type FallbackMap = Record<string, string>;

  const readFallbacks = (): FallbackMap => {
    const raw = settings.getJson<unknown>(FALLBACK_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const map: FallbackMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value) map[key] = value;
    }
    return map;
  };

  const writeFallback = (assistantId: string, modelId: string | null): void => {
    const map = readFallbacks();
    if (modelId) map[assistantId] = modelId;
    else delete map[assistantId];
    settings.setJson(FALLBACK_KEY, map);
  };

  const withFallback = (assistant: Assistant, map = readFallbacks()): Assistant => ({
    ...assistant,
    fallbackModelId: map[assistant.id] ?? null,
  });

  const validateBindings = (modelId: string | null, knowledgeBaseIds: string[]) => {
    if (modelId !== null && !models.findById(modelId)) {
      throw ApiError.validation(`绑定的模型不存在：${modelId}`);
    }
    for (const kbId of knowledgeBaseIds) {
      if (!knowledgeBases.findById(kbId)) {
        throw ApiError.validation(`绑定的知识库不存在：${kbId}`);
      }
    }
  };

  /** knowledge_search 工具必须与知识库绑定同时存在 */
  const validateTools = (enabledTools: string[], knowledgeBaseIds: string[]) => {
    if (enabledTools.includes('knowledge_search') && knowledgeBaseIds.length === 0) {
      throw ApiError.validation('启用知识库检索工具前，请先关联知识库');
    }
  };

  const requireExisting = (id: string): Assistant => {
    const assistant = assistants.findById(id);
    if (!assistant) throw ApiError.notFound('助手', id);
    return assistant;
  };

  const requireCardExists = (cardId: string): void => {
    if (!cards.findById(cardId)) throw ApiError.validation(`角色卡不存在：${cardId}`);
  };
  const requireModelExists = (modelId: string): void => {
    if (!models.findById(modelId)) throw ApiError.validation(`模型不存在：${modelId}`);
  };

  /** v4.18：备用模型必须存在、具备 chat 能力且不同于主模型 */
  const validateFallback = (fallbackModelId: string | null, primaryModelId: string | null) => {
    if (!fallbackModelId) return;
    if (primaryModelId && fallbackModelId === primaryModelId) {
      throw ApiError.validation('备用模型不能与主模型相同');
    }
    const model = models.findById(fallbackModelId);
    if (!model) throw ApiError.validation(`备用模型不存在：${fallbackModelId}`);
    if (!model.capabilities.includes('chat')) {
      throw ApiError.validation('备用模型必须支持对话能力');
    }
  };

  /**
   * v1.8「直接写提示词原文」模式落卡：
   * 当前绑定的是 custom 卡 → 原地更新（同一张卡）；内置卡/无卡 → 新建 identity 卡。
   * 内置卡只读不可改写；绝不删除用户卡库中的任何卡片。
   */
  const saveRawPromptCard = (existing: Assistant, systemPrompt: string): string => {
    const rawMarkdown = buildIdentityCardMarkdown(systemPrompt);
    const parsed = parseWrappedPrompt(rawMarkdown, '提示词保存');
    const current = existing.cardId ? cards.findById(existing.cardId) : null;
    if (current && current.source === 'custom') {
      cards.updateContent(current.id, rawMarkdown, parsed);
      return current.id;
    }
    return cards.create({ source: 'custom', rawMarkdown, parsed }).id;
  };

  return {
    list(): Assistant[] {
      const fallbacks = readFallbacks();
      return assistants.list().map((assistant) => withFallback(assistant, fallbacks));
    },

    get(id: string): Assistant {
      return withFallback(requireExisting(id));
    },

    create(input: AssistantCreateInput): Assistant {
      validateBindings(input.modelId, input.knowledgeBaseIds);
      validateTools(input.enabledTools, input.knowledgeBaseIds);
      validateFallback(input.fallbackModelId, input.modelId);
      if (input.stagePlan) validateStagePlanBindings(deps, input.stagePlan);
      const sortOrder =
        input.sortOrder || assistants.list().length;
      // v1.8：显式选卡走卡模式（校验存在）；否则非空原文自动包成 identity 卡
      let cardId = input.cardId;
      if (cardId) requireCardExists(cardId);
      else if (input.systemPrompt.trim()) {
        const rawMarkdown = buildIdentityCardMarkdown(input.systemPrompt);
        const parsed = parseWrappedPrompt(rawMarkdown, '提示词保存');
        cardId = cards.create({ source: 'custom', rawMarkdown, parsed }).id;
      }
      const created = assistants.create({
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        topP: input.topP,
        maxTokens: input.maxTokens,
        modelId: input.modelId,
        knowledgeBaseIds: input.knowledgeBaseIds,
        enabledTools: input.enabledTools,
        skillNames: input.skillNames,
        retrieveAlways: input.retrieveAlways,
        memoryEnabled: input.memoryEnabled,
        expressionEnabled: input.expressionEnabled,
        personalityFrankness: input.personalityFrankness,
        personalityTsundere: input.personalityTsundere,
        personalityShy: input.personalityShy,
        personalityTolerance: input.personalityTolerance,
        cardId,
        stagePlan: input.stagePlan ?? null,
        isBuiltin: false,
        sortOrder,
      });
      writeFallback(created.id, input.fallbackModelId);
      return { ...created, fallbackModelId: input.fallbackModelId };
    },

    update(id: string, input: AssistantUpdateInput): Assistant {
      const existing = withFallback(requireExisting(id));
      const { fallbackModelId: nextFallbackInput, ...rest } = input;
      const nextModelId = input.modelId !== undefined ? input.modelId : existing.modelId;
      const nextFallback =
        nextFallbackInput !== undefined ? nextFallbackInput : existing.fallbackModelId ?? null;
      const nextKbIds =
        input.knowledgeBaseIds !== undefined ? input.knowledgeBaseIds : existing.knowledgeBaseIds;
      const nextTools = input.enabledTools ?? existing.enabledTools;
      validateBindings(nextModelId, nextKbIds);
      validateTools(nextTools, nextKbIds);
      validateFallback(nextFallback, nextModelId);
      // v1.8 M3：三角色模型覆盖在调优中心矩阵 PATCH，存在性早校验（null=跟随，跳过）
      for (const roleId of [input.plannerModelId, input.executorModelId, input.reviewerModelId]) {
        if (roleId !== undefined && roleId !== null) requireModelExists(roleId);
      }
      if (input.stagePlan !== undefined && input.stagePlan !== null) {
        validateStagePlanBindings(deps, input.stagePlan);
      }

      const patch: AssistantUpdateInput = { ...rest };
      if (input.cardId !== undefined) {
        // 卡模式：cardId 非空校验存在；cardId=null + 同批原文=切到原文模式
        if (input.cardId !== null) {
          requireCardExists(input.cardId);
        } else if (input.systemPrompt?.trim()) {
          patch.cardId = saveRawPromptCard(existing, input.systemPrompt);
        }
      } else if (input.systemPrompt !== undefined) {
        // 仅改原文：非空更新/生成 identity 卡；清空原文回默认卡
        patch.cardId = input.systemPrompt.trim()
          ? saveRawPromptCard(existing, input.systemPrompt)
          : null;
      }
      const updated = assistants.update(id, patch)!;
      if (nextFallbackInput !== undefined) writeFallback(id, nextFallbackInput);
      return { ...updated, fallbackModelId: nextFallback };
    },

    delete(id: string): void {
      const existing = requireExisting(id);
      if (existing.isBuiltin) {
        throw new ApiError('FORBIDDEN', '内置助手不可删除');
      }
      assistants.delete(id);
      writeFallback(id, null);
    },

    /** 全量排序：orderedIds 必须与现有助手集合完全一致 */
    reorder(orderedIds: string[]): Assistant[] {
      const current = assistants.list();
      const currentIds = current.map((a) => a.id).sort();
      const incoming = [...orderedIds].sort();
      if (currentIds.length !== incoming.length || currentIds.some((id, i) => id !== incoming[i])) {
        throw ApiError.validation('排序列表与现有助手不一致');
      }
      const apply = db.transaction((ids: string[]) => {
        ids.forEach((assistantId, index) => {
          assistants.update(assistantId, { sortOrder: index });
        });
      });
      apply(orderedIds);
      return assistants.list();
    },
  };
}

export type AssistantsService = ReturnType<typeof createAssistantsService>;
