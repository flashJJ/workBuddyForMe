import type { Scene } from '@wbfm/shared/schemas';
import { scoreCandidate } from './score';
import type { DecisionCandidate, DecisionContext, RankedCandidate } from './types';

/** 从 Scene 提取打分特征：时长取最后一个 beat，道具去重 */
export function toDecisionCandidate(scene: Scene, playedToday = false): DecisionCandidate {
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
    playedToday,
    lastPlayedAt: null,
  };
}

/** 排序：总分降序 → 上次播放更早 → 场景 id 字典序（保证确定性） */
export function rankCandidates(
  ctx: DecisionContext,
  candidates: readonly DecisionCandidate[],
): RankedCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      ...scoreCandidate(ctx, candidate),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.candidate.lastPlayedAt ?? 0) - (b.candidate.lastPlayedAt ?? 0) ||
        a.candidate.sceneId.localeCompare(b.candidate.sceneId),
    );
}

export function selectBestCandidate(
  ctx: DecisionContext,
  candidates: readonly DecisionCandidate[],
): RankedCandidate | null {
  return rankCandidates(ctx, candidates)[0] ?? null;
}

/** Scene → 候选特征 → 排序（同触发键候选共用） */
export function rankSceneCandidates(
  ctx: DecisionContext,
  scenes: readonly Scene[],
): RankedCandidate[] {
  return rankCandidates(
    ctx,
    scenes.map((scene) => toDecisionCandidate(scene)),
  );
}
