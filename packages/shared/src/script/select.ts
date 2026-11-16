import type { PetScriptSceneMeta } from '../schemas/script/generated';
import type { Scene } from '../schemas/script/scene';
import { scoreCandidate, type DecisionWeights } from './score';
import type { DecisionCandidate, DecisionContext, RankedCandidate } from './types';

/** 从 Scene 提取打分特征：时长取最后一个 beat，道具去重；meta 提供主题/标签与弱偏好 */
export function toDecisionCandidate(
  scene: Scene,
  meta?: PetScriptSceneMeta,
): DecisionCandidate {
  const props = new Set<string>();
  let durationMs = 0;
  for (const beat of scene.beats) {
    durationMs = Math.max(durationMs, beat.at);
    if (beat.cue.kind === 'prop') props.add(beat.cue.prop);
  }
  return {
    sceneId: scene.id,
    durationMs,
    beatCount: scene.beats.length,
    props: [...props],
    playedToday: false,
    lastPlayedAt: null,
    theme: meta?.theme,
    tags: meta?.tags ?? [],
    preferredMoods: meta?.moods,
    preferredHours: meta?.hours,
  };
}

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  return (
    b.score - a.score ||
    (a.candidate.lastPlayedAt ?? 0) - (b.candidate.lastPlayedAt ?? 0) ||
    a.candidate.sceneId.localeCompare(b.candidate.sceneId)
  );
}

/** 排序：总分降序 → 上次播放更早 → 场景 id 字典序（保证确定性） */
export function rankCandidates(
  ctx: DecisionContext,
  candidates: readonly DecisionCandidate[],
  weights?: DecisionWeights,
): RankedCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      ...scoreCandidate(ctx, candidate, weights),
    }))
    .sort(compareRanked);
}

export function selectBestCandidate(
  ctx: DecisionContext,
  candidates: readonly DecisionCandidate[],
  weights?: DecisionWeights,
): RankedCandidate | null {
  return rankCandidates(ctx, candidates, weights)[0] ?? null;
}

/** Scene → 候选特征 → 排序（同触发键候选共用；sceneMeta 来自生成队列） */
export function rankSceneCandidates(
  ctx: DecisionContext,
  scenes: readonly Scene[],
  sceneMeta: Record<string, PetScriptSceneMeta> = {},
  recentSceneIds: readonly string[] = [],
  weights?: DecisionWeights,
): RankedCandidate[] {
  // 最近场景按 id 对齐：打分时排除候选自身，避免「自己的主题/标签匹配自己」
  const recent = recentSceneIds.map((sceneId, index) => ({
    sceneId,
    theme: ctx.recentThemes[index] ?? sceneMeta[sceneId]?.theme ?? '',
    tags: sceneMeta[sceneId]?.tags ?? [],
  }));
  return scenes
    .map((scene) => {
      const candidate = toDecisionCandidate(scene, sceneMeta[scene.id]);
      if (recent.length === 0) {
        return { candidate, ...scoreCandidate(ctx, candidate, weights) };
      }
      const others = recent.filter((entry) => entry.sceneId !== scene.id);
      return {
        candidate,
        ...scoreCandidate(
          {
            ...ctx,
            recentThemes: others.map((entry) => entry.theme).filter(Boolean),
            usedTags: [...new Set(others.flatMap((entry) => entry.tags))],
          },
          candidate,
          weights,
        ),
      };
    })
    .sort(compareRanked);
}
