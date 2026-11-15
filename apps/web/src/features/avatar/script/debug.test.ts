// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ActiveSceneSnapshot } from './director';
import {
  installPetScriptDebug,
  type PetScriptDebugApi,
  type PetScriptDebugSource,
} from './debug';

type DebugWindow = Window & { __petDebug?: PetScriptDebugApi };

describe('installPetScriptDebug（T0.8 dev 观测）', () => {
  it('暴露场景 id / 活跃快照 / 日志 / seed，getter 实时读取', () => {
    const win = window as DebugWindow;
    let active: ActiveSceneSnapshot[] = [
      { sceneId: 'touch.head-tap', priority: 1, cursor: 1, total: 4 },
    ];
    const source: PetScriptDebugSource = {
      getActive: () => active,
      getLog: () => [],
      getSeed: () => 7,
    };

    const dispose = installPetScriptDebug(source, ['touch.head-tap', 'ambient.whisper']);
    expect(dispose).not.toBeNull();
    expect(win.__petDebug?.scenes).toEqual(['touch.head-tap', 'ambient.whisper']);
    expect(win.__petDebug?.seed).toBe(7);
    expect(win.__petDebug?.log).toEqual([]);
    expect(win.__petDebug?.active[0]?.sceneId).toBe('touch.head-tap');

    active = [];
    expect(win.__petDebug?.active).toEqual([]);

    dispose?.();
    expect(win.__petDebug).toBeUndefined();
  });
});
