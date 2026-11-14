import type { ResolvedChatTarget } from '@wbfm/core/chat';
import type { Memory } from '@wbfm/shared/types';
import type {
  PetScriptGenerationRequest,
  PetScriptGenerationResult,
  PetScriptGenerationView,
  PetScriptStorySummary,
  Scene,
} from '@wbfm/shared/schemas';
import { SCRIPT_PRIMITIVES } from '../validation/registry';
import { GENERATED_SCENE_TRIGGERS } from './constants';
import {
  recordGenerated,
  resolveJournal,
  type PetScriptJournalSource,
  type PetScriptJournalStore,
} from './journal';
import { parseGeneratedScene } from './parse';
import { profileContextForPrompt } from './profile';
import { buildScriptGenerationPrompt } from './protocol';
import {
  enqueueScene,
  estimateTokens,
  hasCapacity,
  localDateKey,
  resolveState,
  resolveUsage,
  type PetScriptGenerationState,
  type PetScriptGenerationStore,
} from './state';
import {
  findDuplicate,
  ingestStory,
  resolveStoryState,
  storyContextForPrompt,
  storySummary,
  type PetScriptStoryStore,
} from './story';
import { topicsContextForPrompt, type PetTopicFetcher } from './topics';

/**
 * P8.3：剧本生成服务（服务端）。
 *
 * 流程：每日预算闸门 → 解析默认对话模型 → 受限提示词 → LLM 文本 → fail-closed 校验 → 入队。
 * 任何失败都返回 fallback=true，客户端继续用手写剧本池；失败也消耗一次调用额度，防止连点。
 */

export interface PetScriptGeneratorDeps {
  store: PetScriptGenerationStore;
  /** P8.4：剧情状态（线索/悬念/去重） */
  storyStore: PetScriptStoryStore;
  /** P8.6：每日时事/热点（可选；失败自动降级） */
  topics?: PetTopicFetcher;
  /** P8.6：剧情日记（可选；缺省不记录） */
  journalStore?: PetScriptJournalStore;
  /** M3：用户画像来源（称呼/忌口/作息）；读取失败自动降级 */
  memories?: () => readonly Memory[];
  /** 解析默认对话模型；无模型时抛错 */
  resolveTarget: () => ResolvedChatTarget;
  complete: (target: ResolvedChatTarget, params: { system: string; user: string }) => Promise<string>;
  now?: () => Date;
  random?: () => number;
}

export interface PetScriptGeneratorInput extends PetScriptGenerationRequest {
  /** P8.6：自动窗口生成标记为 auto，手动/事件生成缺省 manual */
  source?: PetScriptJournalSource;
}

export interface PetScriptGenerator {
  list(): PetScriptGenerationView;
  generate(input: PetScriptGeneratorInput): Promise<PetScriptGenerationResult>;
}

function pickTrigger(
  requested: string | undefined,
  random: () => number,
): string {
  const allowed = GENERATED_SCENE_TRIGGERS;
  if (requested && (allowed as readonly string[]).includes(requested)) return requested;
  const index = Math.min(allowed.length - 1, Math.max(0, Math.floor(random() * allowed.length)));
  return allowed[index] ?? 'touch::body::tap';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '生成失败';
}

/** 记忆库读取失败不应阻断生成：降级为无画像 */
function readProfile(memories: (() => readonly Memory[]) | undefined): string | null {
  if (!memories) return null;
  try {
    return profileContextForPrompt(memories());
  } catch {
    return null;
  }
}

/** 提取本场母题：道具与台词池，用于近期去重 */
function sceneMotifs(scene: Scene): { props: string[]; linePools: string[] } {
  const props = new Set<string>();
  const linePools = new Set<string>();
  for (const beat of scene.beats) {
    if (beat.cue.kind === 'prop') props.add(beat.cue.prop);
    if (beat.cue.kind === 'line') linePools.add(beat.cue.pool);
  }
  return { props: [...props], linePools: [...linePools] };
}

export function createPetScriptGenerator(deps: PetScriptGeneratorDeps): PetScriptGenerator {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;

  function load(): PetScriptGenerationState {
    return resolveState(deps.store.load(), localDateKey(now()));
  }

  function save(state: PetScriptGenerationState): void {
    deps.store.save(state);
  }

  function loadStory() {
    return resolveStoryState(deps.storyStore.load());
  }

  function fallback(
    state: PetScriptGenerationState,
    story: PetScriptStorySummary,
    reason: PetScriptGenerationResult['reason'],
    issues: string[],
    modelId: string | null,
  ): PetScriptGenerationResult {
    return {
      ok: false,
      reason,
      scenes: state.scenes,
      issues,
      usage: resolveUsage(state),
      story,
      modelId,
      fallback: true,
    };
  }

  return {
    list() {
      const state = load();
      return {
        scenes: state.scenes,
        usage: resolveUsage(state),
        story: storySummary(loadStory()),
      };
    },

    async generate(input) {
      const state = load();
      const story = loadStory();
      const usage = resolveUsage(state);
      if (!hasCapacity(usage)) {
        return fallback(state, storySummary(story), 'daily-cap', ['今日生成次数或 token 已达上限'], null);
      }

      const trigger = pickTrigger(input.trigger, random);
      const calls = state.calls + 1;
      let target: ResolvedChatTarget;
      try {
        target = deps.resolveTarget();
      } catch (error) {
        const next = { ...state, calls };
        save(next);
        return fallback(next, storySummary(story), 'provider', [errorText(error)], null);
      }

      const topics = deps.topics ? await deps.topics.today() : null;
      const prompt = buildScriptGenerationPrompt({
        primitives: SCRIPT_PRIMITIVES,
        trigger,
        triggers: GENERATED_SCENE_TRIGGERS,
        storyContext: storyContextForPrompt(story),
        todayContext: topicsContextForPrompt(topics),
        profileContext: readProfile(deps.memories) ?? undefined,
        context: { hour: now().getHours() },
      });

      let raw = '';
      try {
        raw = await deps.complete(target, prompt);
      } catch (error) {
        const next = { ...state, calls };
        save(next);
        return fallback(next, storySummary(story), 'provider', [errorText(error)], target.model.modelId);
      }

      const tokens = state.tokens + estimateTokens(prompt.system, prompt.user, raw);
      const parsed = parseGeneratedScene(raw, GENERATED_SCENE_TRIGGERS);
      if (!parsed.scene || !parsed.story) {
        const next = { ...state, calls, tokens };
        save(next);
        return fallback(next, storySummary(story), 'invalid', parsed.issues, target.model.modelId);
      }

      const scene: Scene = parsed.scene;
      const motifs = sceneMotifs(scene);
      const duplicate = findDuplicate(story, scene.id, parsed.story, motifs);
      if (duplicate) {
        const next = { ...state, calls, tokens };
        save(next);
        return fallback(next, storySummary(story), 'invalid', [duplicate], target.model.modelId);
      }

      const nextStory = ingestStory(story, scene.id, parsed.story, now().getTime(), motifs);
      deps.storyStore.save(nextStory);
      const next: PetScriptGenerationState = {
        date: state.date,
        calls,
        tokens,
        scenes: enqueueScene(state.scenes, scene),
      };
      save(next);
      if (deps.journalStore) {
        const journal = recordGenerated(
          resolveJournal(deps.journalStore.load()),
          {
            sceneId: scene.id,
            title: parsed.story.title,
            theme: parsed.story.theme,
            trigger,
            source: input.source ?? 'manual',
            at: now().getTime(),
          },
        );
        deps.journalStore.save(journal);
      }
      return {
        ok: true,
        reason: 'ok',
        scenes: next.scenes,
        issues: [],
        usage: resolveUsage(next),
        story: storySummary(nextStory),
        modelId: target.model.modelId,
        fallback: false,
      };
    },
  };
}
