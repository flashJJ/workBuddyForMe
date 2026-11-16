import { resolveChatTargetForModelId } from '@wbfm/core/chat';
import { createMotionContentService } from '@wbfm/core/services';
import type { SecretCipher } from '@wbfm/core/secrets';
import { PET_SCRIPT_DECISION_LIMITS, type PetScriptDecisionReport } from '@wbfm/shared/schemas';
import {
  attachGate,
  summarizeDecisions,
  type CompanionQualityReport,
} from '@wbfm/shared/script';
import { createMemoryRepository, createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import {
  createPetScriptScheduler,
  isQuietHour,
  PET_SCRIPT_SCHEDULE_KEY,
  type QuietHours,
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
  createPetScriptPlaybackService,
  PET_SCRIPT_PLAYBACK_KEY,
} from './playback';
import type { PlaybackState } from './playback';
import {
  appendDecision,
  PET_SCRIPT_DECISIONS_KEY,
  resolveDecisions,
  toDecisionRecord,
} from './decisions';
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
  /** P8.7 打扰预算：勿扰时段内自动生成直接跳过（不消耗次数） */
  quietHours?: () => QuietHours | null;
}

/** P8.3–P8.5：服务端装配（settings_kv 持久化队列/用量/剧情/调度） */
export function createPetScriptServer(deps: PetScriptServerDeps) {
  const settings = createSettingsRepository(deps.db);
  const memories = createMemoryRepository(deps.db);
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
    content: () => createMotionContentService({ db: deps.db }).get(),
    // M3：画像只取高价值 active 记忆（约束/事实/偏好/共同经历），限 40 条再压缩
    memories: () => memories.list({ status: 'active', limit: 40 }),
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
    quietHours: deps.quietHours,
    store: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_SCHEDULE_KEY, null),
      save: (state: ScheduleState) => settings.setJson(PET_SCRIPT_SCHEDULE_KEY, state),
    },
  });

  const playback = createPetScriptPlaybackService({
    listScenes: () => generator.list().scenes,
    quietHours: deps.quietHours,
    store: {
      load: () => settings.getJson<unknown>(PET_SCRIPT_PLAYBACK_KEY, null),
      save: (state: PlaybackState) => settings.setJson(PET_SCRIPT_PLAYBACK_KEY, state),
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

  const decisions = {
    /** 最近决策（设置页只读；新→旧） */
    list(limit: number = PET_SCRIPT_DECISION_LIMITS.visible) {
      const safe = Math.min(
        PET_SCRIPT_DECISION_LIMITS.maxStored,
        Math.max(1, Math.floor(limit)),
      );
      return resolveDecisions(settings.getJson<unknown>(PET_SCRIPT_DECISIONS_KEY, null)).items.slice(
        0,
        safe,
      );
    },
    /** 桌宠开演后上报；gen.* 标题从剧情日记补齐 */
    record(report: PetScriptDecisionReport) {
      const journalState = resolveJournal(
        settings.getJson<unknown>(PET_SCRIPT_JOURNAL_KEY, null),
      );
      const title =
        journalState.items.find((item) => item.sceneId === report.sceneId)?.title ??
        report.sceneId;
      const current = resolveDecisions(
        settings.getJson<unknown>(PET_SCRIPT_DECISIONS_KEY, null),
      );
      const next = appendDecision(current, toDecisionRecord(report, Date.now(), title));
      settings.setJson(PET_SCRIPT_DECISIONS_KEY, next);
      return next.items[0] ?? null;
    },
  };

  /** v4.1：只读质量汇总（最近决策 + 门控快照；不读聊天正文） */
  function quality(limit: number = PET_SCRIPT_DECISION_LIMITS.maxStored): CompanionQualityReport {
    const window = Math.min(
      PET_SCRIPT_DECISION_LIMITS.maxStored,
      Math.max(1, Math.floor(limit)),
    );
    const recent = decisions.list(window);
    const generated = generator.list();
    const current = playback.summary();
    const played = new Set(current.playedSceneIds);
    const quiet = deps.quietHours?.() ?? null;
    return attachGate(summarizeDecisions(recent, window), {
      perDay: current.perDay,
      playsToday: current.playsToday,
      budgetRemaining: Math.max(0, current.perDay - current.playsToday),
      unplayedScenes: generated.scenes.filter((scene) => !played.has(scene.id)).length,
      quietHoursActive: isQuietHour(new Date().getHours(), quiet),
    });
  }

  return { generator, scheduler, journal, playback, decisions, quality };
}