import { describe, expect, it } from 'vitest';
import type { VRM } from '@pixiv/three-vrm';
import animeartBinding from '../../animation/bindings/animeart-v1.json';
import { KK_MORPHS, KK_MORPH_BY_NAME, findKkMorphs } from './kk-expression-catalog';
import {
  KK_EXPRESSION_PRESETS,
  collectPresetMorphNames,
  resolveKkExpression,
  stripMouthMorphs,
} from './kk-expression-presets';
import { KkFaceDriver } from './kk-face-driver';

/** 口型与眨眼是保留通道，表情组合不得占用 */
const RESERVED_GROUPS = new Set(['A', 'I', 'U', 'E', 'O', 'Blink', 'Blink_L', 'Blink_R']);
const RESERVED_NAMES = new Set(
  Object.entries(animeartBinding.standardExpressions as Record<string, { name: string }[]>)
    .filter(([key]) => RESERVED_GROUPS.has(key))
    .flatMap(([, targets]) => targets.map((target) => target.name)),
);

describe('KK 表情目录', () => {
  it('118 个 morph 全部归类且索引唯一', () => {
    expect(KK_MORPHS).toHaveLength(118);
    expect(new Set(KK_MORPHS.map((morph) => morph.index)).size).toBe(118);
    for (const morph of KK_MORPHS) {
      expect(morph.name.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(morph.intensity);
      expect(morph.part).not.toBeUndefined();
      expect(morph.group).not.toBeUndefined();
    }
  });

  it('部位数量与模型一致（眼 28 / 眉 33 / 嘴 52 / 视线 4 / 其他 1）', () => {
    const count = (part: string) => KK_MORPHS.filter((morph) => morph.part === part).length;
    expect(count('eye')).toBe(28);
    expect(count('brow')).toBe(33);
    expect(count('mouth')).toBe(52);
    expect(count('gaze')).toBe(4);
    expect(count('other')).toBe(1);
  });

  it('语义组与程度可查：开心有轻/中/强三档，惊讶有大小口型', () => {
    const joyIntensities = new Set(findKkMorphs('joy', 'mouth').map((morph) => morph.intensity));
    expect(joyIntensities.has(1)).toBe(true);
    expect(joyIntensities.has(2)).toBe(true);
    expect(joyIntensities.has(3)).toBe(true);
    expect(KK_MORPH_BY_NAME.get('Mouth_shocked_small_op')?.intensity).toBe(1);
    expect(KK_MORPH_BY_NAME.get('Mouth_shocked_op')?.intensity).toBe(2);
    expect(KK_MORPH_BY_NAME.get('Eyes_smug_op')?.group).toBe('smirk');
    expect(KK_MORPH_BY_NAME.get('Eye_look_left')?.group).toBe('gaze');
    expect(KK_MORPH_BY_NAME.get('Eyes_default_cl')?.eyeState).toBe('closed');
    expect(KK_MORPH_BY_NAME.get('Eyes_smile_op')?.eyeState).toBe('open');
  });
});

describe('KK 表情组合预设', () => {
  it('每个标签都有 1/2/3 三档，且权重在 (0,1]', () => {
    for (const [tag, table] of Object.entries(KK_EXPRESSION_PRESETS)) {
      for (const intensity of [1, 2, 3] as const) {
        const combo = table[intensity];
        expect(combo, `${tag}@${intensity}`).toBeTruthy();
        for (const layer of [combo.eye, combo.brow, combo.mouth]) {
          for (const [, weight] of layer ?? []) {
            expect(weight).toBeGreaterThan(0);
            expect(weight).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('预设只引用目录里存在的 morph，且不占用口型/眨眼', () => {
    for (const name of collectPresetMorphNames()) {
      expect(KK_MORPH_BY_NAME.has(name), name).toBe(true);
      expect(RESERVED_NAMES.has(name), name).toBe(false);
    }
  });

  it('surprise/smirk 不再落到空 preset，且程度改变口型大小', () => {
    expect([...resolveKkExpression('neutral').keys()]).toHaveLength(0);
    expect(resolveKkExpression('surprise', 2).get('Mouth_shocked_small_op')).toBe(1);
    expect(resolveKkExpression('surprise', 3).get('Mouth_shocked_op')).toBe(1);
    expect(resolveKkExpression('smirk', 2).get('Eyes_smug_op')).toBe(0.6);
  });

  it('joy 强度 3 用闭口笑，避免带出舌头；说话态剥离嘴部 morph', () => {
    expect(resolveKkExpression('joy', 3).get('Mouth_happy_broad_cl')).toBe(1);
    expect(resolveKkExpression('joy', 3).has('Mouth_happy_broad_op')).toBe(false);

    const weights = resolveKkExpression('joy', 3);
    const speaking = stripMouthMorphs(weights);
    expect([...speaking.keys()].some((name) => name.startsWith('Mouth_'))).toBe(false);
    expect(speaking.get('Eyes_smile_op')).toBe(1);
    expect(speaking.get('Eyebrows_smug_op')).toBe(0.9);
    // 无嘴部权重时原样返回，避免每帧重建 Map
    expect(stripMouthMorphs(speaking)).toBe(speaking);
  });
});

function fakeVrm(
  overrides: { name?: string; dictionary?: Record<string, number>; morphCount?: number } = {},
) {
  const count = overrides.morphCount ?? 118;
  const influences = new Array<number>(count).fill(0);
  const mesh = {
    isMesh: true,
    name: overrides.name ?? 'Body_Model_up_0',
    morphTargetInfluences: influences,
    morphTargetDictionary: overrides.dictionary ?? {
      Eyes_smile_op: 0,
      Mouth_smile_op: 1,
      Eyebrows_smug_op: 2,
    },
  };
  const vrm = { scene: { traverse: (visit: (object: unknown) => void) => visit(mesh) } };
  return { vrm: vrm as unknown as VRM, influences };
}

describe('KkFaceDriver', () => {
  it('按名称写入并在下一帧清理自己写过的索引', () => {
    const { vrm, influences } = fakeVrm();
    const driver = new KkFaceDriver(vrm);
    expect(driver.available).toBe(true);

    driver.apply(new Map([['Eyes_smile_op', 0.7]]));
    expect(influences[0]).toBe(0.7);
    expect(influences[1]).toBe(0);

    driver.apply(new Map([['Mouth_smile_op', 1.4]]));
    expect(influences[0]).toBe(0);
    expect(influences[1]).toBe(1);
  });

  it('数字键 morph 名（家族精简导出）按 binding 顺序补名', () => {
    const { vrm, influences } = fakeVrm({ dictionary: { '0': 0, '1': 1 } });
    const driver = new KkFaceDriver(vrm);
    expect(driver.available).toBe(true);
    driver.apply(new Map([['Eyes_smile_op', 0.5]]));
    expect(influences[60]).toBe(0.5);
  });

  it('不是 KK 网格时降级为不可用', () => {
    const { vrm } = fakeVrm({ name: 'OtherMesh', dictionary: {}, morphCount: 10 });
    expect(new KkFaceDriver(vrm).available).toBe(false);
  });
});
