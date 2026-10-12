/**
 * v1.6 M5 久别迎接（G6）数值契约。
 *
 * 确定性本地反应：不调用 LLM、不新增 IPC、不写情绪状态。
 * 触发时机（应用回到前台/桌宠重新被关注/窗口冷启动）由渲染层决定，
 * 本文件只定义「久别」的分档阈值与短句池规模；真机调参只改这里。
 */

/** 超过此时长未见（约一个工作日/睡眠周期）→ 轻迎接档 */
export const REUNION_WELCOME_MS = 8 * 60 * 60_000;
/** 超过此时长（一整天）→ 想念档 */
export const REUNION_MISS_MS = 24 * 60 * 60_000;
/**
 * 超过此时长（三天，对应现状分析「3 天后固化为图标」的观察窗口）
 * → 久别强档
 */
export const REUNION_LONG_MISS_MS = 72 * 60 * 60_000;

/** 各档本地短句数量（i18n 键 emotion.reunion.<tier>0..N-1，须与词条同步） */
export const REUNION_WELCOME_LINE_COUNT = 4;
export const REUNION_MISS_LINE_COUNT = 4;
export const REUNION_LONG_MISS_LINE_COUNT = 3;

/** 迎接时表情闪现保持时长（ms），结束后回到情绪融合基线表情 */
export const REUNION_EXPRESSION_MS = 3200;
/** 迎接字幕气泡展示时长（ms） */
export const REUNION_LINE_MS = 3600;

/** localStorage 键：跨主窗/pet 窗共享的迎接去重状态 */
export const REUNION_STORAGE_KEY = 'wbfm.reunion.v1';
