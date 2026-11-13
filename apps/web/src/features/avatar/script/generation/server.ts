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
  journalDay,
  journalSettings,
  PET_SCRIPT_JOURNAL_KEY,
  recordPlayed,
  resolveJournal,
  setJournalRetention,
  type PetScriptJournalState,
} from './journal';
import {
  localDateKey,
  PET_SCRIPT_GENERATION_KEY,
  type PetScriptGenerationState,
} from './state';
import {
  PET_SCRIPT_STORY_KEY,
  type StoryState,
} from './story';
import {
  createPetTopicFetcher,
  PET_SCRIPT_TOPICS_KEY,
  type DailyTopics,
  type TopicSearch,
} from './topics';

export interface PetScriptServerDeps {
  db: DatabaseInstance;
  cipher: SecretCipher;
  /** P8.6：core 联网搜索服务（未配置/失败时自动降级为纯日常剧情） */
  search?: TopicSearch;
}

/** P8.3–P8.5：服务端装配（settings_kv 持久化队列/用量/剧情/调度） */
export function createPetScriptServer(deps: PetScriptServerDeps) {
  const settings = createSettingsRepository(deps.db);
  const topics = createPetTopicFetcher({
    store: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_TOPICS_KEY, null),
      save: (state: DailyTopics) => settings.setJson(PET_SCRIPT_TOPICS_KEY, state),
    },
    search: deps.search,
  });
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
    journalStore: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null),
      save: (state: PetScriptJournalState) => settings.setJson(PET_SCRIPT_JOURNAL_KEY, state),
    },
    topics,
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

  const journal = {
    /** 某天（缺省今天）的生成/播放记录 */
    view(date?: string) {
      const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateKey();
      return journalDay(resolveJournal(settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null)), day);
    },
    /** 播放上报：只认已记录的 gen.* 场景，重复上报累加次数 */
    recordPlay(sceneId: string) {
      if (!sceneId.startsWith('gen.')) return { ok: false as const };
      const state = resolveJournal(settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null));
      const next = recordPlayed(state, sceneId, Date.now());
      if (next !== state) settings.setJson(PET_SCRIPT_JOURNAL_KEY, next);
      return { ok: next !== state };
    },
    /** 回顾保留天数（null = 永久保留，默认） */
    settings() {
      return journalSettings(resolveJournal(settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null)));
    },
    /** 修改保留天数并立即裁剪旧记录 */
    setRetention(days: number | null) {
      const state = resolveJournal(settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null));
      const next = setJournalRetention(state, days, Date.now());
      settings.setJson(PET_SCRIPT_JOURNAL_KEY, next);
      return journalSettings(next);
    },
  };

  return { generator, scheduler, journal };
}
