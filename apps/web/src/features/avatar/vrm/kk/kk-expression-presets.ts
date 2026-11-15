/**
 * KK 表情组合预设：8 个应用表情标签 × 3 档程度 → 眼/眉/嘴三层 morph 权重。
 *
 * 设计约束：
 * - 只挑睁眼（_op）版本，闭眼交给眨眼通道，避免和 wink 叠加畸变；
 * - 不占用口型（a/i/u/e/o big）与 wink morph，这两组由 VrmFaceLayer 的保留通道驱动；
 * - 每组程度只改形状大小与附加层级，不改变语义，便于后续做「轻/中/强」调节。
 */
import type { ExpressionTag } from '../../expression/expression-parser';
import type { KkIntensity } from './kk-expression-catalog';

export type KkMorphWeight = readonly [name: string, weight: number];

export interface KkExpressionCombo {
  eye?: readonly KkMorphWeight[];
  brow?: readonly KkMorphWeight[];
  mouth?: readonly KkMorphWeight[];
}

/** 程度档的语义名（UI/日志用） */
export const KK_INTENSITY_LABELS: Record<KkIntensity, string> = {
  1: 'slight',
  2: 'moderate',
  3: 'strong',
};

type ComboTable = Record<KkIntensity, KkExpressionCombo>;

const NEUTRAL: ComboTable = { 1: {}, 2: {}, 3: {} };

export const KK_EXPRESSION_PRESETS: Record<ExpressionTag, ComboTable> = {
  neutral: NEUTRAL,
  joy: {
    1: { eye: [['Eyes_smile_op', 0.5]], mouth: [['Mouth_happy_slight_op', 1]] },
    2: {
      eye: [['Eyes_smile_op', 0.8]],
      brow: [['Eyebrows_smug_op', 0.5]],
      mouth: [['Mouth_smile_op', 0.9]],
    },
    3: {
      eye: [['Eyes_smile_op', 1]],
      brow: [['Eyebrows_smug_op', 0.9]],
      // 不用 happy_broad_op：该 morph 会带出舌头，改用闭口版
      mouth: [['Mouth_happy_broad_cl', 1]],
    },
  },
  sadness: {
    1: { eye: [['Eyes_worried_op', 0.4]], brow: [['Eyebrows_worried_op', 0.6]] },
    2: {
      eye: [['Eyes_crying_op', 0.6]],
      brow: [['Eyebrows_worried_op', 0.8]],
      mouth: [['Mouth_lonely_op', 0.5]],
    },
    3: {
      eye: [['Eyes_crying_op', 1]],
      brow: [['Eyebrows_dejected_op', 0.9]],
      mouth: [['Mouth_lonely_op', 1]],
    },
  },
  anger: {
    1: { brow: [['Eyebrows_angry_op', 0.6]], mouth: [['Mouth_angry_op', 0.4]] },
    2: {
      eye: [['Eyes_angry_op', 0.8]],
      brow: [['Eyebrows_angry_op', 0.9]],
      mouth: [['Mouth_angry_op', 0.7]],
    },
    3: {
      eye: [['Eyes_angry_op', 1]],
      brow: [['Eyebrows_angry_op', 1]],
      mouth: [['Mouth_angry_2_op', 1]],
    },
  },
  fear: {
    1: { eye: [['Eyes_worried_op', 0.5]], brow: [['Eyebrows_worried_op', 0.6]] },
    2: {
      eye: [['Eyes_distress_op', 0.8]],
      brow: [['Eyebrows_worried_op', 0.9]],
      mouth: [['Mouth_shocked_small_op', 0.5]],
    },
    3: {
      eye: [['Eyes_distress_op', 1]],
      brow: [['Eyebrows_shocked_op', 0.9]],
      mouth: [['Mouth_shocked_op', 0.6]],
    },
  },
  surprise: {
    1: { brow: [['Eyebrows_shocked_op', 0.6]], mouth: [['Mouth_shocked_small_op', 0.8]] },
    2: { brow: [['Eyebrows_shocked_op', 1]], mouth: [['Mouth_shocked_small_op', 1]] },
    3: {
      eye: [['Eyes_gageye', 0.5]],
      brow: [['Eyebrows_shocked_op', 1]],
      mouth: [['Mouth_shocked_op', 1]],
    },
  },
  disgust: {
    1: { brow: [['Eyebrows_displeased_op', 0.6]], mouth: [['Mouth_hate_op', 0.4]] },
    2: {
      eye: [['Eyes_hate_op', 0.6]],
      brow: [['Eyebrows_displeased_op', 0.9]],
      mouth: [['Mouth_hate_op', 0.8]],
    },
    3: {
      eye: [['Eyes_hate_op', 1]],
      brow: [['Eyebrows_displeased_op', 1]],
      mouth: [['Mouth_hate_op', 1]],
    },
  },
  smirk: {
    1: { brow: [['Eyebrows_smug_op', 0.7]], mouth: [['Mouth_smug_op', 0.6]] },
    2: {
      eye: [['Eyes_smug_op', 0.6]],
      brow: [['Eyebrows_smug_op', 1]],
      mouth: [['Mouth_smug_op', 0.9]],
    },
    3: {
      eye: [['Eyes_smug_op', 0.9]],
      brow: [['Eyebrows_smug_op', 1]],
      mouth: [['Mouth_smug_op', 1]],
    },
  },
};

/** 解析成「morph 名称 → 权重」，同名取最大值；无 KK 数据时返回空 Map */
export function resolveKkExpression(
  tag: ExpressionTag,
  intensity: KkIntensity = 2,
): ReadonlyMap<string, number> {
  const table = KK_EXPRESSION_PRESETS[tag] ?? NEUTRAL;
  const combo = table[intensity] ?? table[2];
  const weights = new Map<string, number>();
  for (const layer of [combo.eye, combo.brow, combo.mouth]) {
    for (const [name, weight] of layer ?? []) {
      const value = Math.min(1, Math.max(weights.get(name) ?? 0, weight));
      if (value > 0) weights.set(name, value);
    }
  }
  return weights;
}

/** 说话时剥掉嘴部表情，只留眼/眉；嘴型交给口型通道，避免张嘴 morph 带出舌头 */
export function stripMouthMorphs(
  weights: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  let hasMouth = false;
  for (const name of weights.keys()) {
    if (name.startsWith('Mouth_')) {
      hasMouth = true;
      break;
    }
  }
  if (!hasMouth) return weights;
  const stripped = new Map<string, number>();
  for (const [name, weight] of weights) {
    if (!name.startsWith('Mouth_')) stripped.set(name, weight);
  }
  return stripped;
}

/** 单测/未来校验用：预设里出现的全部 morph 名 */
export function collectPresetMorphNames(): string[] {
  const names = new Set<string>();
  for (const table of Object.values(KK_EXPRESSION_PRESETS)) {
    for (const combo of Object.values(table)) {
      for (const layer of [combo.eye, combo.brow, combo.mouth]) {
        for (const [name] of layer ?? []) names.add(name);
      }
    }
  }
  return [...names].sort();
}
