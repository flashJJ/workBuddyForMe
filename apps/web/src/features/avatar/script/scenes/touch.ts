/**
 * v3.0 剧本引擎 T0.5：6 条内置触摸链的等价场景。
 *
 * 与 interaction-chains 的 ACTION_CHAINS 逐条等价：
 * - pose:squash / pose:tap 对应 playSquash / tap；
 * - expression.holdMs 对应 flashExpression；holdMs=0 对应 setExpression；
 * - line 对应 subtitle.pick（ms 缺省由适配器补 3200）。
 * interaction.start 由指针层负责，不在场景内重复声明。
 */

import type { Scene } from '@wbfm/shared/schemas';

export const TOUCH_SCENES: readonly Scene[] = [
  {
    id: 'touch.head-tap',
    triggers: ['touch::head::tap'],
    priority: 1,
    cooldownMs: 500,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'pose', preset: 'squash' } },
      { at: 0, cue: { kind: 'pose', preset: 'tap' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2600 } },
      { at: 0, cue: { kind: 'line', pool: 'head-tap' } },
    ],
  },
  {
    id: 'touch.head-longpress',
    triggers: ['touch::head::longpress'],
    priority: 1,
    cooldownMs: 1000,
    interrupt: 'all',
    gating: { level: { min: 'acquaintance' } },
    beats: [
      { at: 0, cue: { kind: 'pose', preset: 'squash' } },
      { at: 0, cue: { kind: 'expression', tag: 'surprise', holdMs: 4200 } },
      { at: 0, cue: { kind: 'line', pool: 'head-longpress' } },
    ],
  },
  {
    id: 'touch.body-tap',
    triggers: ['touch::body::tap'],
    priority: 1,
    cooldownMs: 800,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'pose', preset: 'squash' } },
      { at: 0, cue: { kind: 'pose', preset: 'tap' } },
      { at: 0, cue: { kind: 'expression', tag: 'smirk', holdMs: 1800 } },
      { at: 0, cue: { kind: 'line', pool: 'body-tap' } },
    ],
  },
  {
    id: 'touch.body-longpress',
    triggers: ['touch::body::longpress'],
    priority: 1,
    cooldownMs: 1600,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'pose', preset: 'squash' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2400 } },
      { at: 0, cue: { kind: 'line', pool: 'body-longpress' } },
    ],
  },
  {
    id: 'touch.body-double',
    triggers: ['touch::body::double'],
    priority: 1,
    cooldownMs: 1600,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'expression', tag: 'smirk', holdMs: 0 } },
      { at: 0, cue: { kind: 'pose', preset: 'tap' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 1400 } },
      { at: 0, cue: { kind: 'line', pool: 'body-double' } },
    ],
  },
  {
    id: 'touch.raised-tap',
    triggers: ['touch::raised::tap'],
    priority: 1,
    cooldownMs: 1500,
    interrupt: 'all',
    gating: { level: { min: 'partner' } },
    beats: [
      { at: 0, cue: { kind: 'pose', preset: 'squash' } },
      { at: 0, cue: { kind: 'expression', tag: 'surprise', holdMs: 2000 } },
      { at: 0, cue: { kind: 'line', pool: 'raised' } },
    ],
  },
];
