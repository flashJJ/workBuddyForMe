import { createCharacterCardRepository } from '@wbfm/database';
import { parseCharacterCard } from '@wbfm/shared/character-card';
import { createMeetingSpeaker, type MeetingServiceDeps } from '@wbfm/core/meeting';
import { buildPersonaBlock, resolveChatTargetForModelId } from '@wbfm/core/chat';
import type { ServiceDeps } from '@wbfm/core/services';
import type { AssistantsService } from '@wbfm/core/services';

/**
 * v1.9 M3 会议服务生产装配（web 容器）：
 * - 共用模型：会议 model_id → 系统默认；
 * - 发言客户端：无工具纯对话；
 * - 成员姓名取助手表；人格只取该成员自己的 v1.8 角色卡（绝不注入其他成员卡）。
 */
export function createMeetingDeps(
  deps: ServiceDeps,
  assistants: AssistantsService,
): MeetingServiceDeps {
  const getAssistant = (id: string) => assistants.list().find((a) => a.id === id) ?? null;

  return {
    db: deps.db,
    resolveTarget: (modelId) => resolveChatTargetForModelId(deps, modelId),
    createSpeaker: (target) => createMeetingSpeaker(target),
    getMemberName: (id) => getAssistant(id)?.name ?? null,
    getPersonaBlock: (id) => {
      const assistant = getAssistant(id);
      const cardId = assistant?.cardId;
      if (!cardId) return null;
      const card = createCharacterCardRepository(deps.db).findById(cardId);
      if (!card) return null;
      const parsed = parseCharacterCard(card.rawMarkdown);
      return parsed.ok ? buildPersonaBlock(parsed.card) : null;
    },
  };
}
