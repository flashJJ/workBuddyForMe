import type { ResolvedChatTarget } from '@wbfm/core/chat';
import type {
  PetScriptGenerationRequest,
  PetScriptGenerationResult,
  PetScriptGenerationView,
  PetScriptStorySummary,
  Scene,
} from '@wbfm/shared/schemas';
import { SCRIPT_PRIMITIVES } from '../validation/registry';
import { GENERATED_SCENE_TRIGGERS } from './constants';
import { parseGeneratedScene } from './parse';
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
  /** 解析默认对话模型；无模型时抛错 */
  resolveTarget: () => ResolvedChatTarget;
  complete: (target: ResolvedChatTarget, params: { system: string; user: string }) => Promise<string>;
  now?: () => Date;
  random?: () => number;
}

export interface PetScriptGenerator {
  list(): PetScriptGenerationView;
  generate(input: PetScriptGenerationRequest): Promise<PetScriptGenerationResult>;
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

      const prompt = buildScriptGenerationPrompt({
        primitives: SCRIPT_PRIMITIVES,
        trigger,
        triggers: GENERATED_SCENE_TRIGGERS,
        storyContext: storyContextForPrompt(story),
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
      const duplicate = findDuplicate(story, scene.id, parsed.story);
      if (duplicate) {
        const next = { ...state, calls, tokens };
        save(next);
        return fallback(next, storySummary(story), 'invalid', [duplicate], target.model.modelId);
      }

      const nextStory = ingestStory(story, scene.id, parsed.story, now().getTime());
      deps.storyStore.save(nextStory);
      const next: PetScriptGenerationState = {
        date: state.date,
        calls,
        tokens,
        scenes: enqueueScene(state.scenes, scene),
      };
      save(next);
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
