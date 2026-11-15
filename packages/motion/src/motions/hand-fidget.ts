import type { MotionDefinition } from '../contracts';

/**
 * M0d：待机手部动作集（L2）。
 *
 * 放松 → 握拳 → 保持 → 摊开 → 保持 → 放松，循环；
 * 左右手由调用方错开半个周期（3.2s），避免双手同步像机械爪。
 */

interface Key {
  at: number;
  shape: 'relaxed' | 'fist' | 'open';
  easing?: 'easeInOut' | 'easeOut';
}

const KEYS: readonly Key[] = [
  { at: 0, shape: 'relaxed' },
  { at: 600, shape: 'fist', easing: 'easeInOut' },
  { at: 1400, shape: 'fist' },
  { at: 2000, shape: 'open', easing: 'easeOut' },
  { at: 2800, shape: 'open' },
  { at: 3200, shape: 'relaxed', easing: 'easeInOut' },
  { at: 6400, shape: 'relaxed' },
];

function fidget(id: string, side: 'left' | 'right'): MotionDefinition {
  return {
    id,
    durationMs: 6400,
    loop: true,
    keys: KEYS.map((key) => ({
      at: key.at,
      pose: `pose.hand-${side}-${key.shape}`,
      easing: key.easing,
    })),
  };
}

export const HAND_FIDGET_LEFT = fidget('motion.hand-fidget-left', 'left');
export const HAND_FIDGET_RIGHT = fidget('motion.hand-fidget-right', 'right');

export const HAND_FIDGETS: readonly MotionDefinition[] = [HAND_FIDGET_LEFT, HAND_FIDGET_RIGHT];
