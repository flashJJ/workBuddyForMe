/**
 * P3 M0d-C：日常场戏（干饭 / 工作提醒 / 被叫胖）+ T2.5 坐窗沿。
 *
 * 触摸场戏在 scenes/touch.ts（与 `touch::head::tap` 共用触发键）。
 * 干饭、被叫胖与坐窗沿暂无可用的上游触发键（M2 喂饭、M3 对话识别、座位检测），
 * 先保留空 triggers，由 dev `__petDebug.playScene` 手动播放验证；
 * 工作提醒直接复用感知层已在发的 `context::workStreak`。
 *
 * P5.5：鞠躬 / 叉腰 / 托腮 / 打哈欠与 `touch.body-tap` 共用身体单击触发键，
 * 由 useScriptDirector 的同键轮换游标依次挑选，避免永远只演同一条。
 *
 * 场景没有独立时长：最后一条 beat 的 at 决定结束时刻，同时作为视线收尾锚点。
 */

import type { Scene } from '@wbfm/shared/schemas';

export const MOMENT_SCENES: readonly Scene[] = [
  {
    id: 'moment.eat-rice',
    triggers: [],
    priority: 2,
    cooldownMs: 120_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.eat-rice' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 4000 } },
      { at: 0, cue: { kind: 'line', pool: 'eat-rice' } },
      { at: 4000, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.work-rest',
    triggers: ['context::workStreak'],
    priority: 2,
    cooldownMs: 1_800_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'away', weight: 0.6 } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.work-focus' } },
      { at: 0, cue: { kind: 'expression', tag: 'sadness', holdMs: 1800 } },
      // 伏案 2.4s 后抬头伸懒腰（behavior.wake 的 enter 是 pose.stretch-cycle）
      { at: 2400, cue: { kind: 'behavior', behavior: 'behavior.wake' } },
      { at: 2400, cue: { kind: 'look', target: 'camera' } },
      { at: 2400, cue: { kind: 'expression', tag: 'joy', holdMs: 3000 } },
      { at: 2400, cue: { kind: 'line', pool: 'work-rest' } },
      { at: 5400, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.called-fat',
    triggers: [],
    priority: 1,
    cooldownMs: 30_000,
    interrupt: 'all',
    // 生气表情由 behavior.scold-fat 的 morph 轨道自带，场景只负责视线与台词
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.scold-fat' } },
      { at: 0, cue: { kind: 'line', pool: 'called-fat' } },
      { at: 3000, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.sit-sill',
    triggers: [],
    priority: 2,
    cooldownMs: 180_000,
    interrupt: 'all',
    // T2.5：坐窗沿（高度锚点 + 腿部端点 IK），6s 后起身回站姿
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'pose', preset: 'sit-sill' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 5000 } },
      { at: 6000, cue: { kind: 'pose', preset: 'stand' } },
      { at: 6000, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  // P5.5：身体单击轮换场戏（与 touch.body-tap 共用触发键，priority 2 受对话/睡眠门控）
  {
    id: 'moment.bow',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 30_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.bow' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2200 } },
      { at: 2300, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.hands-on-hips',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 45_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.hands-on-hips' } },
      { at: 0, cue: { kind: 'expression', tag: 'smirk', holdMs: 3000 } },
      { at: 3200, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.chin-rest',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 45_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.chin-rest' } },
      { at: 0, cue: { kind: 'look', target: 'away', weight: 0.5 } },
      { at: 3600, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.yawn',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 60_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.yawn' } },
      { at: 0, cue: { kind: 'look', target: 'away', weight: 0.4 } },
      { at: 3100, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'moment.hug',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 120_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.hug' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2600 } },
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 2900, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  // S3：手持道具场戏——挂茶杯 3.2s 后卸下，验证 prop cue → PropLayer 闭环
  {
    id: 'moment.tea',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 45_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'prop', prop: 'teacup', action: 'attach' } },
      { at: 0, cue: { kind: 'prop', prop: 'table', action: 'show' } },
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 3000 } },
      { at: 3200, cue: { kind: 'prop', prop: 'teacup', action: 'detach' } },
      { at: 3200, cue: { kind: 'prop', prop: 'table', action: 'hide' } },
      { at: 3200, cue: { kind: 'look', target: 'camera' } },
    ],
  },
];
