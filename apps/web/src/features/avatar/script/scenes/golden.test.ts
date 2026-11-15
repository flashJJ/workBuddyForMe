import { describe, expect, it } from 'vitest';
import type { Scene } from '@wbfm/shared/schemas';
import { BUILT_IN_SCENES } from '../scenes';

/** 只保留时间与 cue 类别：快照变化必须显式确认，避免场景无声漂移 */
function timeline(scene: Scene): { id: string; beats: { at: number; kind: string }[] } {
  return {
    id: scene.id,
    beats: scene.beats.map((beat) => ({ at: beat.at, kind: beat.cue.kind })),
  };
}

describe('内置场景 golden（M5）', () => {
  it('cue 时间线快照', () => {
    expect(BUILT_IN_SCENES.map(timeline)).toMatchSnapshot();
  });

  it('场景 id 顺序稳定（新增场景需显式更新快照）', () => {
    expect(BUILT_IN_SCENES.map((scene) => scene.id)).toMatchSnapshot();
  });
});
