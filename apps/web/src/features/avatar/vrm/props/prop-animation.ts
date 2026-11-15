/**
 * 道具自身动画采样（S5）：纯时间函数，不依赖 three/DOM。
 *
 * 全部按 4.8s 循环，输出局部旋转与液体透明度；
 * 运行时由 `VrmPropLayer.update(dt)` 与角色动画共用同一个 dt 推进。
 */
export type PropAnimationId = 'pour' | 'flip';

export interface PropAnimationFrame {
  /** 绕局部 X 的倾倒角（弧度） */
  rootX: number;
  /** 绕局部 Z 的倾倒角（弧度） */
  rootZ: number;
  /** 书本封面枢轴绕 Y 的开合角（弧度，0 = 合上） */
  coverY: number;
  /** 倒水流柱透明度 0..1 */
  streamOpacity: number;
}

export const PROP_ANIMATION_MS = 4800;

const EMPTY: PropAnimationFrame = { rootX: 0, rootZ: 0, coverY: 0, streamOpacity: 0 };

export function samplePropAnimation(
  id: PropAnimationId,
  elapsedMs: number,
): PropAnimationFrame {
  const cycle = ((elapsedMs % PROP_ANIMATION_MS) + PROP_ANIMATION_MS) % PROP_ANIMATION_MS;
  const t = cycle / PROP_ANIMATION_MS;
  if (id === 'pour') {
    // 0 → 1 → 0：前半个周期倾倒，后半个周期回正
    const wave = Math.sin(t * Math.PI);
    const amount = wave * wave;
    return {
      rootX: 0.18 * amount,
      rootZ: 0.55 * amount,
      coverY: 0,
      streamOpacity: 0.55 * amount,
    };
  }
  if (id === 'flip') {
    // 70% 的时间开合一次，剩下 30% 保持合上
    const open = t < 0.7 ? Math.sin((t / 0.7) * Math.PI) : 0;
    return { rootX: 0, rootZ: 0, coverY: -1.2 * open, streamOpacity: 0 };
  }
  return EMPTY;
}
