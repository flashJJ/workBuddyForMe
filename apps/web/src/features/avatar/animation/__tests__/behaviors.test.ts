import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from '../behaviors';
import type { BehaviorDefinition, PhaseDefinition } from '../contracts';
import { MOTIONS } from '../motions';
import { POSES } from '../poses';

const poseIds = new Set(POSES.map((pose) => pose.id));
const motionIds = new Set(MOTIONS.map((motion) => motion.id));

function phases(def: BehaviorDefinition): PhaseDefinition[] {
  return [def.enter, def.loop, def.exit].filter((phase): phase is PhaseDefinition => Boolean(phase));
}

describe('行为注册表', () => {
  it('id 唯一且优先级合法', () => {
    const ids = BEHAVIORS.map((behavior) => behavior.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const behavior of BEHAVIORS) {
      expect([0, 1, 2, 3]).toContain(behavior.priority);
    }
  });

  it('每个行为至少声明一个阶段', () => {
    for (const behavior of BEHAVIORS) {
      expect(phases(behavior).length, behavior.id).toBeGreaterThan(0);
    }
  });

  it('轨道引用的姿势与动作都存在', () => {
    for (const behavior of BEHAVIORS) {
      for (const phase of phases(behavior)) {
        for (const track of phase.tracks) {
          if (track.kind === 'pose') {
            expect(poseIds.has(track.pose), `${behavior.id} -> ${track.pose}`).toBe(true);
          } else if (track.kind === 'motion') {
            expect(motionIds.has(track.motion), `${behavior.id} -> ${track.motion}`).toBe(true);
          }
        }
      }
    }
  });
});
