/**
 * v1.6 M3 桌宠/形象触摸交互常量（rail 与 /pet 共用同一份配置）。
 *
 * 行为：头部短按 → 缩头弹性 + 害羞表情；窗口内连摸 N 次进入保护期
 * （抗议表情 + 本地短句）；普通摸头按概率与冷却播放本地短句。
 * 全部反馈确定性，零模型调用、零新 IPC。
 */

/** 连摸计数窗口：窗口外第一次摸重新计数（ms） */
export const HEAD_TOUCH_WINDOW_MS = 2000;
/** 窗口内达到此次数触发保护期 */
export const HEAD_TOUCH_TRIGGER_COUNT = 3;
/** 保护期持续时长（期间摸头给抗议反馈而非害羞） */
export const HEAD_TOUCH_PROTECT_MS = 8000;
/** 两次有效触摸的最小间隔（防单次按压重复触发，ms） */
export const HEAD_TOUCH_DEBOUNCE_MS = 350;

/** 普通摸头本地短句触发概率 0..1 */
export const TOUCH_LINE_PROBABILITY = 0.35;
/** 两次本地短句最小间隔（ms） */
export const TOUCH_LINE_COOLDOWN_MS = 30_000;
/** 本地短句每日上限（防刷；按本地日期计数） */
export const TOUCH_LINE_DAILY_CAP = 12;

/** 缩头弹性动画时长（ms） */
export const TOUCH_SQUASH_MS = 210;
/** 按下瞬间纵向缩放（0.86~1.04 的 sin 包络由渲染层实现） */
export const TOUCH_SQUASH_SCALE_Y = 0.94;
export const TOUCH_SQUASH_SCALE_X = 1.04;

/** 害羞/抗议闪现表情持续时长（ms），结束后回融发表情 */
export const TOUCH_BLUSH_MS = 2600;

/**
 * 普通摸头害羞表情、保护期抗议表情（映射到既有 8 标签，无独立 blush/wronged 词表）：
 * 害羞用 joy（笑眼≈害羞开心）；连摸抗议用 sadness（委屈求饶，而非真的愤怒——
 * anger 保留给用户 belittle，避免玩笑互动产生负向关系暗示）。
 */
export const TOUCH_BLUSH_EXPRESSION = 'joy' as const;
export const TOUCH_PROTECT_EXPRESSION = 'sadness' as const;

/** 本地短句数量（i18n 键 emotion.touch.blush0..N-1 / protect0..N-1，须与词条同步） */
export const TOUCH_BLUSH_LINE_COUNT = 6;
export const TOUCH_PROTECT_LINE_COUNT = 4;
