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

/**
 * v2.26 混合召回与生命周期：
 * - 候选池：向量与 FTS 各取 MEMORY_HYBRID_CANDIDATES 条后融合；
 * - 融合权重：语义 0.55 / 关键词 0.20 / 重要性 0.15 / 新鲜度 0.10；
 *   无嵌入模型时语义权重并入关键词（0.75 / 0.15 / 0.10），保证关键词可召回；
 * - 下限：融合分低于 MEMORY_RECALL_MIN_SCORE 丢弃；
 * - 置顶：constraint/pinned 记忆融合分下限提到 MEMORY_PINNED_MIN_SCORE，
 *   每轮最多注入 MEMORY_PINNED_LIMIT 条；
 * - 新鲜度半衰期：事实/偏好 180 天，事件 60 天，共同经历 365 天，约束不衰减。
 */
export const MEMORY_HYBRID_CANDIDATES = 20;
export const MEMORY_SEMANTIC_WEIGHT = 0.55;
export const MEMORY_LEXICAL_WEIGHT = 0.2;
export const MEMORY_IMPORTANCE_WEIGHT = 0.15;
export const MEMORY_RECENCY_WEIGHT = 0.1;
export const MEMORY_RECALL_MIN_SCORE = 0.5;
export const MEMORY_PINNED_MIN_SCORE = 0.9;
export const MEMORY_PINNED_LIMIT = 3;
/** 实时硬约束写入的重要性下限（不调用 LLM，规则命中即高置信） */
export const MEMORY_CONSTRAINT_MIN_IMPORTANCE = 0.95;

export const MEMORY_HALF_LIFE_DAYS: Record<string, number> = {
  fact: 180,
  preference: 180,
  event: 60,
  relationship: 365,
  // 约束不随时间衰减（极大半衰期等价于 recency≈1）
  constraint: 36500,
};

