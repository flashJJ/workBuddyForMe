import { resolveChatTargetForModelId } from '@wbfm/core/chat';
import type { SecretCipher } from '@wbfm/core/secrets';
import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import {
  createPetScriptScheduler,
  PET_SCRIPT_SCHEDULE_KEY,
  type ScheduleState,
} from './schedule';
import { createPetScriptGenerator } from './service';
import {
  PET_SCRIPT_GENERATION_KEY,
  type PetScriptGenerationState,
} from './state';
import { PET_SCRIPT_STORY_KEY, type StoryState } from './story';

export interface PetScriptServerDeps {
  db: DatabaseInstance;
  cipher: SecretCipher;
}

/** P8.3–P8.5：服务端装配（settings_kv 持久化队列/用量/剧情/调度） */
export function createPetScriptServer(deps: PetScriptServerDeps) {
  const settings = createSettingsRepository(deps.db);
  const generator = createPetScriptGenerator({
    store: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_GENERATION_KEY, null),
      save: (state: PetScriptGenerationState) =>
        settings.setJson(PET_SCRIPT_GENERATION_KEY, state),
    },
    storyStore: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_STORY_KEY, null),
      save: (state: StoryState) => settings.setJson(PET_SCRIPT_STORY_KEY, state),
    },
    resolveTarget: () => resolveChatTargetForModelId(deps, null),
    complete: async (target, { system, user }) => {
      let content = '';
      const stream = target.provider.chatStream({
        model: target.model.modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
      });
      for await (const chunk of stream) {
        if (chunk.delta) content += chunk.delta;
      }
      return content;
    },
  });

  const scheduler = createPetScriptScheduler({
    generator,
    store: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_SCHEDULE_KEY, null),
      save: (state: ScheduleState) => settings.setJson(PET_SCRIPT_SCHEDULE_KEY, state),
    },
  });

  return { generator, scheduler };
}
