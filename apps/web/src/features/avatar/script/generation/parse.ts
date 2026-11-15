import {
  PET_SCRIPT_GENERATED_PREFIX,
  PET_SCRIPT_GENERATION_LIMITS,
  petScriptStoryMetaSchema,
  sceneSchema,
  type PetScriptStoryMeta,
  type Scene,
} from '@wbfm/shared/schemas';
import {
  GENERATED_BLOCKED_BEHAVIORS,
  GENERATED_BLOCKED_CUES,
  GENERATED_BLOCKED_POSES,
  GENERATED_SCENE_TRIGGERS,
} from './constants';
import { validateScene } from '../validation/validate';
import type { MotionContent } from '../../animation';

/**
 * P8.3：模型输出 → 场景（fail-closed）。
 *
 * zod 只保证形状；这里额外收紧「生成场景」的边界：
 * 触发键白名单、id 前缀、节奏上限、禁用未接线/带状态的 cue、道具成对、至少一句台词；
 * 最后再走一遍 validateScene（原语白名单），有任何丢弃即整条拒绝。
 */

export interface ParsedGeneratedScene {
  scene: Scene | null;
  /** 合法场景必带（裸 Scene 输出会按 id/cue 派生） */
  story: PetScriptStoryMeta | null;
  issues: string[];
}

/** 兼容旧格式（裸 Scene）：从 id 与 cue 类型派生最小剧情元信息 */
function deriveStoryMeta(scene: Scene): PetScriptStoryMeta {
  const base = scene.id.replace(/^gen\./, '').replace(/[-_]+/g, ' ');
  const tags = [...new Set(scene.beats.map((beat) => beat.cue.kind))].slice(0, 5);
  const title = base.trim().slice(0, 20) || scene.id.slice(0, 20);
  return {
    title,
    theme: base.trim().slice(0, 40) || scene.id.slice(0, 40),
    tags: tags.length > 0 ? tags : ['日常'],
  };
}

/** 模型可能输出 { story, scene } 或裸 Scene；统一取出两段 */
function splitPayload(parsed: unknown): { scene: unknown; story: unknown } {
  if (parsed && typeof parsed === 'object' && 'scene' in (parsed as Record<string, unknown>)) {
    const record = parsed as Record<string, unknown>;
    return { scene: record.scene, story: record.story };
  }
  return { scene: parsed, story: undefined };
}

function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('模型输出不是 JSON');
  }
}

function cueKinds(scene: Scene): string[] {
  return scene.beats.map((beat) => beat.cue.kind);
}

/** 道具必须成对且顺序正确：attach→detach、show→hide */
function propPairingIssues(scene: Scene): string[] {
  const issues: string[] = [];
  const state = new Map<string, 'on' | 'off'>();
  for (const beat of scene.beats) {
    const cue = beat.cue;
    if (cue.kind !== 'prop') continue;
    const current = state.get(cue.prop) ?? 'off';
    if (cue.action === 'attach' || cue.action === 'show') {
      if (current === 'on') issues.push(`道具 ${cue.prop} 重复 ${cue.action}`);
      state.set(cue.prop, 'on');
      continue;
    }
    if (current !== 'on') issues.push(`道具 ${cue.prop} 在没有 ${cue.action === 'detach' ? 'attach' : 'show'} 的情况下 ${cue.action}`);
    state.set(cue.prop, 'off');
  }
  for (const [prop, value] of state) {
    if (value === 'on') issues.push(`道具 ${prop} 没有在场景结束前收起`);
  }
  return issues;
}

function sceneRules(scene: Scene): string[] {
  const issues: string[] = [];
  if (!scene.id.startsWith(PET_SCRIPT_GENERATED_PREFIX)) {
    issues.push(`场景 id 必须以 ${PET_SCRIPT_GENERATED_PREFIX} 开头`);
  }
  if (scene.triggers.length !== 1) issues.push('triggers 必须恰好一个');
  if (scene.priority > 2) issues.push('priority 只能是 1 或 2');
  if (scene.cooldownMs < 120_000 || scene.cooldownMs > 1_800_000) {
    issues.push('cooldownMs 必须在 120000..1800000');
  }
  if (scene.beats.length < PET_SCRIPT_GENERATION_LIMITS.minBeats) {
    issues.push(`beats 至少 ${PET_SCRIPT_GENERATION_LIMITS.minBeats} 条`);
  }
  if (scene.beats.length > PET_SCRIPT_GENERATION_LIMITS.maxBeats) {
    issues.push(`beats 不能超过 ${PET_SCRIPT_GENERATION_LIMITS.maxBeats} 条`);
  }
  const last = scene.beats[scene.beats.length - 1]?.at ?? 0;
  if (last < PET_SCRIPT_GENERATION_LIMITS.minDurationMs) {
    issues.push(`最后一条 beat 不能早于 ${PET_SCRIPT_GENERATION_LIMITS.minDurationMs}ms`);
  }
  if (last > PET_SCRIPT_GENERATION_LIMITS.maxDurationMs) {
    issues.push(`最后一条 beat 不能超过 ${PET_SCRIPT_GENERATION_LIMITS.maxDurationMs}ms`);
  }
  if (!cueKinds(scene).includes('line')) issues.push('至少需要一条 line 台词池');
  for (const beat of scene.beats) {
    const cue = beat.cue;
    if (GENERATED_BLOCKED_CUES.has(cue.kind)) issues.push(`生成场景禁用 cue: ${cue.kind}`);
    if (cue.kind === 'pose' && GENERATED_BLOCKED_POSES.has(cue.preset)) {
      issues.push(`生成场景禁用 pose: ${cue.preset}`);
    }
    if (cue.kind === 'behavior' && GENERATED_BLOCKED_BEHAVIORS.has(cue.behavior)) {
      issues.push(`生成场景禁用 behavior: ${cue.behavior}`);
    }
    if (cue.kind === 'motion' && cue.motion.startsWith('motion:')) {
      issues.push('生成场景暂不支持 VRMA motion:<file>');
    }
  }
  issues.push(...propPairingIssues(scene));
  return issues;
}

/** 解析并校验一条生成场景；issues 非空时 scene=null */
export function parseGeneratedScene(
  raw: string,
  allowedTriggers: readonly string[] = GENERATED_SCENE_TRIGGERS,
  content?: MotionContent,
): ParsedGeneratedScene {
  let payload: unknown;
  try {
    payload = extractJson(raw);
  } catch (error) {
    return {
      scene: null,
      story: null,
      issues: [error instanceof Error ? error.message : '模型输出不是 JSON'],
    };
  }

  const { scene: sceneRaw, story: storyRaw } = splitPayload(payload);
  const result = sceneSchema.safeParse(sceneRaw);
  if (!result.success) {
    return {
      scene: null,
      story: null,
      issues: result.error.issues.map((issue) => `${issue.path.join('.') || 'scene'}: ${issue.message}`),
    };
  }

  let story: PetScriptStoryMeta | null = null;
  if (storyRaw !== undefined) {
    const parsedStory = petScriptStoryMetaSchema.safeParse(storyRaw);
    if (!parsedStory.success) {
      return {
        scene: null,
        story: null,
        issues: parsedStory.error.issues.map(
          (issue) => `story.${issue.path.join('.') || ''}: ${issue.message}`,
        ),
      };
    }
    story = parsedStory.data;
    if (story.cliffhanger && story.resolves) {
      return { scene: null, story: null, issues: ['story.cliffhanger 与 story.resolves 只能二选一'] };
    }
    story = { ...story, tags: [...new Set(story.tags)] };
  }

  const scene = result.data;
  const issues = sceneRules(scene);
  for (const trigger of scene.triggers) {
    if (!allowedTriggers.includes(trigger)) issues.push(`未知触发键: ${trigger}`);
  }
  if (issues.length > 0) return { scene: null, story: null, issues };

  const validated = validateScene(scene, content ? { content } : undefined);
  if (validated.dropped.length > 0) {
    return { scene: null, story: null, issues: validated.dropped };
  }
  return {
    scene: validated.scene,
    story: story ?? deriveStoryMeta(validated.scene),
    issues: [],
  };
}
