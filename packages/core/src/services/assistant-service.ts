import { ApiError } from '@wbfm/shared/errors';
import { type Assistant } from '@wbfm/shared/types';
import { type AssistantCreateInput, type AssistantUpdateInput } from '@wbfm/shared/schemas';
import {
  createAssistantRepository,
  createKnowledgeRepository,
  createModelRepository,
} from '@wbfm/database';
import type { ServiceDeps } from './deps';
import { ensureSeedData } from './seed';

export function createAssistantsService({ db }: ServiceDeps) {
  ensureSeedData(db);
  const assistants = createAssistantRepository(db);
  const models = createModelRepository(db);
  const knowledgeBases = createKnowledgeRepository(db);

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

  return {
    list(): Assistant[] {
      return assistants.list();
    },

    get(id: string): Assistant {
      return requireExisting(id);
    },

    create(input: AssistantCreateInput): Assistant {
      validateBindings(input.modelId, input.knowledgeBaseIds);
      validateTools(input.enabledTools, input.knowledgeBaseIds);
      const sortOrder =
        input.sortOrder || assistants.list().length;
      return assistants.create({
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
        retrieveAlways: input.retrieveAlways,
        memoryEnabled: input.memoryEnabled,
        expressionEnabled: input.expressionEnabled,
        personalityFrankness: input.personalityFrankness,
        personalityTsundere: input.personalityTsundere,
        personalityShy: input.personalityShy,
        personalityTolerance: input.personalityTolerance,
        isBuiltin: false,
        sortOrder,
      });
    },

    update(id: string, input: AssistantUpdateInput): Assistant {
      const existing = requireExisting(id);
      const nextModelId = input.modelId !== undefined ? input.modelId : existing.modelId;
      const nextKbIds =
        input.knowledgeBaseIds !== undefined ? input.knowledgeBaseIds : existing.knowledgeBaseIds;
      const nextTools = input.enabledTools ?? existing.enabledTools;
      validateBindings(nextModelId, nextKbIds);
      validateTools(nextTools, nextKbIds);
      return assistants.update(id, input)!;
    },

    delete(id: string): void {
      const existing = requireExisting(id);
      if (existing.isBuiltin) {
        throw new ApiError('FORBIDDEN', '内置助手不可删除');
      }
      assistants.delete(id);
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
