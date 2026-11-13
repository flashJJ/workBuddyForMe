/**
 * P8.3：生成器可用的触发键与状态黑名单。
 *
 * 生成场景必须挂到真实会发生的触发键上，否则只能靠 dev 面板手动点；
 * 带持久状态的原语（睡眠/背对/坐姿/被拎起）不允许交给 LLM，避免生成一场戏后角色卡状态里。
 */

/** 与内置场景/事件同口径；新增触发键时同步这里 */
export const GENERATED_SCENE_TRIGGERS = [
  'touch::head::tap',
  'touch::head::longpress',
  'touch::body::tap',
  'touch::body::longpress',
  'touch::body::double',
  'touch::raised::tap',
  'context::workStreak',
] as const;

/** 会改变常驻状态的 pose 预设（squash/tap 是瞬时反馈，允许） */
export const GENERATED_BLOCKED_POSES = new Set([
  'sleep',
  'wake',
  'face-away',
  'face-front',
  'sit-sill',
  'sit-desk',
  'stand',
]);

/** 会接管状态机/需要外部手势的行为，生成场景禁用 */
export const GENERATED_BLOCKED_BEHAVIORS = new Set([
  'behavior.idle',
  'behavior.sleep',
  'behavior.wake',
  'behavior.face-away',
  'behavior.lifted',
  'behavior.land',
]);

/** 生成场景禁用的 cue 类型：未接线或会引入分支/外部资源 */
export const GENERATED_BLOCKED_CUES = new Set([
  'speak',
  'wait',
  'branch',
  'sound',
  'effect',
  'move',
  'emit',
]);
