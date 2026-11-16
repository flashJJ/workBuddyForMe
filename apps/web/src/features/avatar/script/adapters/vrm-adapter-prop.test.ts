import { describe, expect, it, vi } from 'vitest';
import type { Cue } from '@wbfm/shared/schemas';
import { ScriptDirector, type CueLogEntry, type ScriptContext } from '../director';
import { BUILT_IN_SCENES } from '../scenes';
import { VrmCueAdapter, type VrmCueTarget } from './vrm-adapter';

class PropController implements VrmCueTarget {
  hand: Array<{ id: string; on: boolean }> = [];
  stage: Array<{ id: string; on: boolean }> = [];

  flashExpression(): void {}

  attachProp(id: string, on = true): Promise<boolean> {
    this.hand.push({ id, on });
    return Promise.resolve(true);
  }

  showProp(id: string, on = true): Promise<boolean> {
    this.stage.push({ id, on });
    return Promise.resolve(true);
  }
}

function entry(cue: Cue, sceneId = 'test.scene'): CueLogEntry {
  return { sceneId, at: 0, beatAt: 0, track: 'world', cue };
}

function setup() {
  const controller = new PropController();
  const adapter = new VrmCueAdapter({ controller });
  return { controller, adapter };
}

function ctx(): ScriptContext {
  return {
    hour: 14,
    relationshipLevel: 'partner',
    mood: 'normal',
    emotionEnabled: true,
    linesEnabled: true,
    doNotDisturb: { enabled: true, startHour: 23, endHour: 6 },
    busy: false,
    sleeping: false,
    faceAway: false,
    random: () => 0.5,
  };
}

describe('VrmCueAdapter prop cue（S3/S4）', () => {
  it('手持道具 attach/detach，场景结束自动清理', () => {
    const { controller, adapter } = setup();
    adapter.execute(entry({ kind: 'prop', prop: 'teacup', action: 'attach' }), () => 0);
    expect(controller.hand).toEqual([{ id: 'teacup', on: true }]);
    adapter.end('test.scene', 'complete');
    expect(controller.hand).toEqual([
      { id: 'teacup', on: true },
      { id: 'teacup', on: false },
    ]);
  });

  it('未登记 id 与动作/类型错配被拒绝', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { controller, adapter } = setup();
    adapter.execute(entry({ kind: 'prop', prop: 'unknown', action: 'attach' }), () => 0);
    adapter.execute(entry({ kind: 'prop', prop: 'teacup', action: 'show' }), () => 0);
    adapter.execute(entry({ kind: 'prop', prop: 'table', action: 'attach' }), () => 0);
    expect(controller.hand).toEqual([]);
    expect(controller.stage).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('场景道具 show/hide，场景结束自动隐藏', () => {
    const { controller, adapter } = setup();
    adapter.execute(entry({ kind: 'prop', prop: 'table', action: 'show' }), () => 0);
    expect(controller.stage).toEqual([{ id: 'table', on: true }]);
    adapter.end('test.scene', 'complete');
    expect(controller.stage).toEqual([
      { id: 'table', on: true },
      { id: 'table', on: false },
    ]);
  });

  it('两个场景共用同一道具时，先结束的场景不抢卸', () => {
    const { controller, adapter } = setup();
    adapter.execute(entry({ kind: 'prop', prop: 'teacup', action: 'attach' }, 'a'), () => 0);
    adapter.execute(entry({ kind: 'prop', prop: 'teacup', action: 'attach' }, 'b'), () => 0);
    adapter.end('a', 'complete');
    expect(controller.hand).toHaveLength(2);
    adapter.end('b', 'complete');
    expect(controller.hand.at(-1)).toEqual({ id: 'teacup', on: false });
  });

  it('moment.tea 经 Director 后手持与场景道具都闭环', () => {
    const { controller, adapter } = setup();
    const director = new ScriptDirector({ scenes: BUILT_IN_SCENES, sink: adapter });
    expect(director.play('moment.tea', ctx())).toBe(true);
    expect(controller.hand).toEqual([{ id: 'teacup', on: true }]);
    expect(controller.stage).toEqual([{ id: 'table', on: true }]);

    director.update(3300);
    expect(controller.hand).toEqual([
      { id: 'teacup', on: true },
      { id: 'teacup', on: false },
    ]);
    expect(controller.stage).toEqual([
      { id: 'table', on: true },
      { id: 'table', on: false },
    ]);
    director.dispose();
  });

  it('v4.3：动态注册表道具可 attach，场景结束自动清理', () => {
    const controller = new PropController();
    const adapter = new VrmCueAdapter({
      controller,
      getProps: () => ({
        'pack.test.cube': {
          id: 'pack.test.cube',
          url: '/api/prop-assets?pack=x&file=y',
          kind: 'hand',
          license: 'CC0-1.0',
          contact: 0.03,
        },
      }),
    });

    adapter.execute(entry({ kind: 'prop', prop: 'pack.test.cube', action: 'attach' }), () => 0);
    expect(controller.hand).toEqual([{ id: 'pack.test.cube', on: true }]);
    adapter.end('test.scene', 'complete');
    expect(controller.hand.at(-1)).toEqual({ id: 'pack.test.cube', on: false });
  });
});
