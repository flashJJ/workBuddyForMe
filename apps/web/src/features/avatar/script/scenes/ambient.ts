/**
 * v3.0 剧本引擎 T0.6：环境场景（低语 / 环顾 / 换重心）。
 *
 * 与现有行为等价：低语对应 usePetAmbientTalk（ambient 池，3600ms）；
 * 环顾/换重心对应 VrmController.tickAmbient 的 glance/tilt 微行为。
 * 触发与频率仍由决策层控制（M0 不改变现有调度），场景只负责「演什么」。
 */

import type { Scene } from '@wbfm/shared/schemas';

export const AMBIENT_SCENES: readonly Scene[] = [
  {
    id: 'ambient.whisper',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [{ at: 0, cue: { kind: 'line', pool: 'ambient', ms: 3600 } }],
  },
  {
    id: 'ambient.glance',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'away', weight: 0.6, holdMs: 600 } },
      { at: 700, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'ambient.shift-weight',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'tilt', intensity: 0.5 } }],
  },
];
