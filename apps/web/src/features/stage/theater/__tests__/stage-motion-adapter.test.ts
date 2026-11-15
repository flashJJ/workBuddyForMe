import { describe, expect, it } from 'vitest';
import { STAGE_SAFE_MOTIONS, stageMotionCue } from '../stage-motion-adapter';
import { THEATER_EPISODES } from '../theater-script';

describe('舞台动作映射（S1）', () => {
  it('分组默认只映射到安全头颈动作', () => {
    expect(stageMotionCue({ motion: 'idle' })).toMatchObject({ kind: 'motion', id: 'motion.nod' });
    expect(stageMotionCue({ motion: 'listening' })).toMatchObject({ kind: 'motion', id: 'motion.glance' });
    expect(stageMotionCue({ motion: 'thinking' })).toMatchObject({ kind: 'motion', id: 'motion.tilt' });
    expect(stageMotionCue({ motion: 'working' })).toMatchObject({ kind: 'motion', id: 'motion.nod-double' });
    for (const motion of ['idle', 'listening', 'thinking', 'working'] as const) {
      expect(STAGE_SAFE_MOTIONS).toContain(stageMotionCue({ motion }).id);
    }
  });

  it('显式 motionId 优先，未登记动作回落分组默认', () => {
    expect(stageMotionCue({ motion: 'working', motionId: 'motion.shake' })).toMatchObject({
      kind: 'motion',
      id: 'motion.shake',
    });
    expect(stageMotionCue({ motion: 'working', motionId: 'motion.tiptoe' })).toMatchObject({
      kind: 'motion',
      id: 'motion.nod-double',
    });
  });

  it('behavior 只放行舞台白名单，其余回落动作', () => {
    expect(stageMotionCue({ motion: 'working', behaviorId: 'behavior.bow' })).toEqual({
      kind: 'behavior',
      id: 'behavior.bow',
    });
    expect(stageMotionCue({ motion: 'thinking', behaviorId: 'behavior.chin-rest' })).toMatchObject({
      kind: 'motion',
      id: 'motion.tilt',
    });
  });

  it('内置剧本每句都能映射到安全动作', () => {
    for (const episode of THEATER_EPISODES) {
      for (const line of episode.lines) {
        const cue = stageMotionCue(line);
        if (cue.kind === 'motion') expect(STAGE_SAFE_MOTIONS).toContain(cue.id);
        else expect(cue.id).toBe('behavior.bow');
      }
    }
  });
});
