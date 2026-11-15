/**
 * P8.2：本地剧本池（3 条手写剧本）。
 *
 * 与触摸/环境场戏的区别：
 * - 无触发键（triggers 为空），只能由 dev 面板或 `__petDebug.playScene` 手动播放；
 * - 每条覆盖不同的原语组合，作为生成器接入前的确定性回放样本：
 *   1. morning-tea：手持道具 + 场景道具 + 表情/视线/台词
 *   2. reading-break：书本道具 + 分层行为 + 视线/台词
 *   3. desk-stretch：剧本专用 motion（全身）+ 表情/视线/台词
 *
 * 最后一条 beat 决定场景结束时刻；道具在结束前显式收起，便于验证清理链路。
 */
import type { Scene } from '@wbfm/shared/schemas';

export const POOL_SCENES: readonly Scene[] = [
  {
    id: 'pool.morning-tea',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'prop', prop: 'teacup', action: 'attach' } },
      { at: 0, cue: { kind: 'prop', prop: 'table', action: 'show' } },
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 4200 } },
      { at: 0, cue: { kind: 'line', pool: 'cheer' } },
      { at: 4600, cue: { kind: 'look', target: 'camera' } },
      { at: 5200, cue: { kind: 'prop', prop: 'teacup', action: 'detach' } },
      { at: 5200, cue: { kind: 'prop', prop: 'table', action: 'hide' } },
      { at: 5200, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'pool.reading-break',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'prop', prop: 'book', action: 'attach' } },
      { at: 0, cue: { kind: 'behavior', behavior: 'behavior.work-focus' } },
      { at: 0, cue: { kind: 'look', target: 'down', weight: 0.8 } },
      { at: 0, cue: { kind: 'line', pool: 'ambient' } },
      { at: 3600, cue: { kind: 'expression', tag: 'joy', holdMs: 2400 } },
      { at: 3600, cue: { kind: 'look', target: 'camera' } },
      { at: 3600, cue: { kind: 'line', pool: 'work-rest' } },
      { at: 5600, cue: { kind: 'prop', prop: 'book', action: 'detach' } },
      { at: 5600, cue: { kind: 'look', target: 'camera' } },
    ],
  },
  {
    id: 'pool.desk-stretch',
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'motion', motion: 'motion.stretch-up' } },
      { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2600 } },
      { at: 0, cue: { kind: 'look', target: 'away', weight: 0.5 } },
      { at: 2400, cue: { kind: 'look', target: 'camera' } },
      { at: 2600, cue: { kind: 'line', pool: 'work-rest' } },
      { at: 3400, cue: { kind: 'look', target: 'camera' } },
    ],
  },
];
