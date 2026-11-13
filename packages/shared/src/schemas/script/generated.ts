/**
 * P8.3：剧本生成契约（LLM 候选 → 校验 → 入队 → 客户端播放）。
 *
 * 只定义请求/结果与用量形状；生成器实现、提示词与白名单在 web 端，
 * 因为原语目录来自 animation/prop 注册表，不能下沉到 shared。
 */
import { z } from 'zod';
import type { Scene } from './scene';

/** 生成场景 id 前缀：与手写场景隔离，便于清理与排查 */
export const PET_SCRIPT_GENERATED_PREFIX = 'gen.';

export const PET_SCRIPT_GENERATION_LIMITS = {
  /** 每日最多调用次数（失败也计数） */
  dailyCalls: 8,
  /** 每日估算 token 上限（按字符数粗略折算） */
  dailyTokens: 60_000,
  /** 单场 beat 数下限/上限（1–3 分钟需要足够多的节点） */
  minBeats: 8,
  maxBeats: 80,
  /** 单场时长下限/上限：最后一条 beat 必须落在这个区间 */
  minDurationMs: 60_000,
  maxDurationMs: 180_000,
  /** 队列里最多保留的生成场景数 */
  maxQueue: 10,
} as const;

export const petScriptGenerationRequestSchema = z.object({
  /** 指定触发键（必须在白名单内）；缺省由生成器挑选 */
  trigger: z.string().trim().min(1).max(80).optional(),
});
export type PetScriptGenerationRequest = z.infer<typeof petScriptGenerationRequestSchema>;

/** P8.4：模型随场景返回的剧情元信息（用于续接与去重） */
export const petScriptStoryMetaSchema = z.object({
  /** 短标题（展示用） */
  title: z.string().trim().min(1).max(40),
  /** 主题指纹（归一化后比较，如「喝茶休息」） */
  theme: z.string().trim().min(1).max(80),
  /** 2–5 个梗标签 */
  tags: z.array(z.string().trim().min(1).max(24)).min(1).max(5),
  /** 本场留下的悬念（下一场续接） */
  cliffhanger: z.string().trim().max(80).optional(),
  /** 本场收掉的旧悬念（与 cliffhanger 二选一） */
  resolves: z.string().trim().max(80).optional(),
});
export type PetScriptStoryMeta = z.infer<typeof petScriptStoryMetaSchema>;

/** 剧情状态摘要（客户端/面板只读展示） */
export interface PetScriptStorySummary {
  /** 未收线的线索数 */
  openThreads: number;
  /** 最近用过的主题（新→旧） */
  recentThemes: string[];
  /** 当前待续接的悬念；null = 无 */
  cliffhanger: string | null;
  /** 已用梗标签（去重后的最近集合） */
  usedTags: string[];
}

export const EMPTY_STORY_SUMMARY: PetScriptStorySummary = {
  openThreads: 0,
  recentThemes: [],
  cliffhanger: null,
  usedTags: [],
};

export interface PetScriptGenerationUsage {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  calls: number;
  tokens: number;
  callLimit: number;
  tokenLimit: number;
}

export type PetScriptGenerationReason = 'ok' | 'daily-cap' | 'provider' | 'invalid';

export interface PetScriptGenerationResult {
  /** 至少 1 条合法场景并入队 */
  ok: boolean;
  reason: PetScriptGenerationReason;
  /** 生成后队列中的全部场景（客户端整体替换） */
  scenes: Scene[];
  /** 被拒绝的原因（校验失败/模型输出问题） */
  issues: string[];
  usage: PetScriptGenerationUsage;
  /** 剧情状态摘要（续接/去重展示） */
  story: PetScriptStorySummary;
  /** 实际使用的模型 id（解析失败为 null） */
  modelId: string | null;
  /** true = 本次没有可播放的新场景，客户端继续用本地剧本池 */
  fallback: boolean;
}

export interface PetScriptGenerationView {
  /** 已入队的生成场景（按生成时间倒序） */
  scenes: Scene[];
  usage: PetScriptGenerationUsage;
  /** 剧情状态摘要 */
  story: PetScriptStorySummary;
}

/** P8.5：每日自动生成摘要（默认关闭） */
export interface PetScriptScheduleSummary {
  enabled: boolean;
  /** 每日计划次数（当前固定 2，对应 10 点 / 16 点两个窗口） */
  perDay: number;
  /** 今日已自动生成次数 */
  runsToday: number;
}

export interface PetScriptStatusView extends PetScriptGenerationView {
  schedule: PetScriptScheduleSummary;
}

export type PetScriptTickReason = 'ok' | 'disabled' | 'not-due' | PetScriptGenerationReason;

/** POST /api/pet/script/tick：客户端心跳触发一次「到期检查」 */
export interface PetScriptTickResult extends PetScriptStatusView {
  triggered: boolean;
  reason: PetScriptTickReason;
  issues: string[];
}

export const petScriptScheduleRequestSchema = z.object({
  enabled: z.boolean(),
});
export type PetScriptScheduleRequest = z.infer<typeof petScriptScheduleRequestSchema>;
