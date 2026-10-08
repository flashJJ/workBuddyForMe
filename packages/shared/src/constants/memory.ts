/** 长期记忆域：检索阈值、写入去重、提取上限与遗忘（软归档）策略 */

/**
 * v0.5 长期记忆：
 * - 提问时按用户消息向量检索 MEMORY_TOP_K 条，L2 距离（单位向量）超过
 *   MEMORY_RECALL_MAX_DISTANCE 的丢弃——归一化向量 L2≈sqrt(2-2cos)，
 *   1.05 约等于余弦相似度 0.45。该值按小型本地嵌入模型（qwen3-embedding:0.6b）
 *   在 scripts/eval golden set 上实测校准：短中文问句与其记忆的余弦常在
 *   0.5~0.65 区间，0.78（cos 0.70）会导致几乎零召回；放宽后由 MEMORY_TOP_K
 *   限量、system 提示「无关无需提及」兜底降噪；
 * - 写入去重：与最近邻距离 ≤ MEMORY_DUPLICATE_MAX_DISTANCE（≈cos 0.94）
 *   视为同一记忆，更新合并而非新建；
 * - MEMORY_BLOCK_RESERVE 为注入 system 的记忆块预留空间。
 */
export const MEMORY_TOP_K = 3;
export const MEMORY_RECALL_MAX_DISTANCE = 1.05;
export const MEMORY_DUPLICATE_MAX_DISTANCE = 0.35;
export const MEMORY_BLOCK_RESERVE_TOKENS = 512;
/** 单次回合提取候选记忆的上限，防止小模型输出失控 */
export const MEMORY_EXTRACT_MAX_ITEMS = 5;
/** 重要性取值范围（模型打分） */
export const MEMORY_IMPORTANCE_MIN = 0;
export const MEMORY_IMPORTANCE_MAX = 1;

/**
 * v0.5 P1-1 遗忘策略（软归档，可在管理页恢复）：
 * - 归档条件：创建超过 MEMORY_DECAY_AFTER_DAYS 天、重要性低于
 *   MEMORY_DECAY_MIN_IMPORTANCE、且从未被召回（或上次召回也早于
 *   MEMORY_DECAY_ACCESS_STALE_DAYS 天）的 active 记忆；
 * - 后台衰减任务借回合成功后机会执行，两次运行至少间隔
 *   MEMORY_DECAY_INTERVAL_DAYS 天；
 * - 会话压缩摘要作为情景记忆（event）入库时使用的固定重要性。
 */
export const MEMORY_DECAY_MIN_IMPORTANCE = 0.4;
export const MEMORY_DECAY_AFTER_DAYS = 30;
export const MEMORY_DECAY_ACCESS_STALE_DAYS = 30;
export const MEMORY_DECAY_INTERVAL_DAYS = 7;
export const MEMORY_SUMMARY_IMPORTANCE = 0.6;
