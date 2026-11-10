/**
 * v3.0 剧本引擎 T0.6：状态场景（睡眠 / 唤醒 / 背对 / 转回）。
 *
 * 睡眠与背对仍由 usePetSleep / usePetFaceAway 判定并驱动渲染；
 * 场景只把状态切换表达成可复用的 pose 预设，供 M0 开关接入后统一走 Director。
 * 状态场景优先级 1：不被 sleeping/faceAway 门控挡住（门控只挡 P2/P3）。
 */

import type { Scene } from '@wbfm/shared/schemas';

export const STATE_SCENES: readonly Scene[] = [
  {
    id: 'state.sleep',
    triggers: [],
    priority: 1,
    cooldownMs: 0,
    interrupt: 'never',
    beats: [{ at: 0, cue: { kind: 'pose', preset: 'sleep' } }],
  },
  {
    id: 'state.wake',
    triggers: [],
    priority: 1,
    cooldownMs: 0,
    interrupt: 'never',
    beats: [{ at: 0, cue: { kind: 'pose', preset: 'wake' } }],
  },
  {
    id: 'state.face-away',
    triggers: [],
    priority: 1,
    cooldownMs: 0,
    interrupt: 'never',
    beats: [{ at: 0, cue: { kind: 'pose', preset: 'face-away' } }],
  },
  {
    id: 'state.face-front',
    triggers: [],
    priority: 1,
    cooldownMs: 0,
    interrupt: 'never',
    beats: [{ at: 0, cue: { kind: 'pose', preset: 'face-front' } }],
  },
];
