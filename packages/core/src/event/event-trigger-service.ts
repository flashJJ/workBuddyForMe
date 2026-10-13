/**
 * v1.7 M5 自定义短语触发器服务：event_triggers 仓储薄封装。
 * 存在性校验复用助手仓储（规则必须绑定存在的助手；内置/自定义助手均可）。
 */
import { createAssistantRepository, createEventTriggerRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type {
  EventTriggerCreateInput,
  EventTriggerUpdateInput,
  EventTriggerView,
} from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';

export interface EventTriggersService {
  list(assistantId?: string): EventTriggerView[];
  listEnabledByAssistant(assistantId: string): EventTriggerView[];
  create(input: EventTriggerCreateInput): EventTriggerView;
  update(id: string, patch: EventTriggerUpdateInput): EventTriggerView;
  delete(id: string): void;
}

export function createEventTriggersService(deps: ServiceDeps): EventTriggersService {
  const repo = createEventTriggerRepository(deps.db);
  const assistants = createAssistantRepository(deps.db);
  const requireAssistant = (assistantId: string): void => {
    if (!assistants.findById(assistantId)) {
      throw ApiError.notFound('助手', assistantId);
    }
  };

  return {
    list(assistantId) {
      if (assistantId) requireAssistant(assistantId);
      return repo.list(assistantId);
    },
    listEnabledByAssistant(assistantId) {
      return repo.listEnabledByAssistant(assistantId);
    },
    create(input) {
      requireAssistant(input.assistantId);
      return repo.create(input);
    },
    update(id, patch) {
      const updated = repo.update(id, patch);
      if (!updated) throw ApiError.notFound('触发器', id);
      return updated;
    },
    delete(id) {
      if (!repo.delete(id)) throw ApiError.notFound('触发器', id);
    },
  };
}
