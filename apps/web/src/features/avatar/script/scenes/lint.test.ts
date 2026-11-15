import { describe, expect, it } from 'vitest';
import {
  BEAT_MAX_MS,
  SCENE_INTERRUPT_POLICIES,
  type Beat,
  type Cue,
  type Scene,
} from '@wbfm/shared/schemas';
import { GENERATED_SCENE_TRIGGERS } from '../generation/constants';
import { BUILT_IN_SCENES } from '../scenes';
import { validateScene } from '../validation/validate';

const TRIGGERS = new Set<string>(GENERATED_SCENE_TRIGGERS);
const INTERRUPTS = new Set<string>(SCENE_INTERRUPT_POLICIES);
/** 只靠 wait 撑时长的场景没有可感知反馈 */
const SILENT: ReadonlySet<Cue['kind']> = new Set(['wait']);

function flattenCues(cues: readonly Cue[], out: Cue[] = []): Cue[] {
  for (const cue of cues) {
    out.push(cue);
    if (cue.kind === 'branch') {
      flattenCues(cue.then, out);
      if (cue.else) flattenCues(cue.else, out);
    }
  }
  return out;
}

function cuesOf(scene: Scene): Cue[] {
  return flattenCues(scene.beats.map((beat: Beat) => beat.cue));
}

/**
 * v3.0 M5：跨场景剧本 lint。
 * 逐场测试只保证自己那组场景，这里兜住新增场景的整体一致性。
 */
describe('剧本 lint（M5）', () => {
  it('场景 id 非空且全局唯一', () => {
    const ids = BUILT_IN_SCENES.map((scene) => scene.id);
    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('触发键、优先级、冷却与打断策略都在白名单内', () => {
    for (const scene of BUILT_IN_SCENES) {
      for (const trigger of scene.triggers) {
        expect(TRIGGERS.has(trigger), `${scene.id} 触发键 ${trigger}`).toBe(true);
      }
      expect(Number.isInteger(scene.priority), `${scene.id} priority`).toBe(true);
      expect(scene.priority, scene.id).toBeGreaterThanOrEqual(0);
      expect(scene.priority, scene.id).toBeLessThanOrEqual(100);
      expect(Number.isInteger(scene.cooldownMs), `${scene.id} cooldown`).toBe(true);
      expect(scene.cooldownMs, scene.id).toBeGreaterThanOrEqual(0);
      expect(INTERRUPTS.has(scene.interrupt), `${scene.id} interrupt`).toBe(true);
    }
  });

  it('beats 非空、时间单调且不超过上限', () => {
    for (const scene of BUILT_IN_SCENES) {
      expect(scene.beats.length, scene.id).toBeGreaterThan(0);
      let previous = 0;
      for (const beat of scene.beats) {
        expect(Number.isFinite(beat.at), scene.id).toBe(true);
        expect(beat.at, scene.id).toBeGreaterThanOrEqual(previous);
        expect(beat.at, scene.id).toBeLessThanOrEqual(BEAT_MAX_MS);
        previous = beat.at;
      }
    }
  });

  it('每场至少有一个可感知 cue，且至少有一句台词用于兜底', () => {
    for (const scene of BUILT_IN_SCENES) {
      const cues = cuesOf(scene);
      expect(cues.length, scene.id).toBeGreaterThan(0);
      expect(
        cues.some((cue) => !SILENT.has(cue.kind)),
        `${scene.id} 只有 wait`,
      ).toBe(true);
    }
    expect(BUILT_IN_SCENES.some((scene) => cuesOf(scene).some((cue) => cue.kind === 'line'))).toBe(
      true,
    );
  });

  it('道具 attach/detach 与 show/hide 在同一场内成对', () => {
    for (const scene of BUILT_IN_SCENES) {
      const actions = cuesOf(scene)
        .filter((cue): cue is Extract<Cue, { kind: 'prop' }> => cue.kind === 'prop')
        .map((cue) => cue.action);
      const count = (action: string) => actions.filter((item) => item === action).length;
      expect(count('attach'), `${scene.id} attach/detach`).toBe(count('detach'));
      expect(count('show'), `${scene.id} show/hide`).toBe(count('hide'));
    }
  });

  it('validateScene 不丢弃任何 beat（含 branch 递归）', () => {
    for (const scene of BUILT_IN_SCENES) {
      const result = validateScene(scene);
      expect(result.dropped, scene.id).toEqual([]);
      expect(result.scene.beats.length, scene.id).toBe(scene.beats.length);
    }
  });
});
