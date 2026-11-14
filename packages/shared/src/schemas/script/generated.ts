/**
 * P8.3：剧本生成契约（LLM 候选 → 校验 → 入队 → 客户端播放）。
 *
 * 只定义请求/结果与用量形状；生成器实现、提示词与白名单在 web 端，
 * 因为原语目录来自 animation/prop 注册表，不能下沉到 shared。
 */
import { z } from 'zod';
import { MOTION_MOODS, type MotionMood } from '../media/motion-asset';
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
  /** 阶段 3：弱偏好提示（可选；非法值直接丢弃，不影响整条校验） */
  moods: z.array(z.enum(MOTION_MOODS)).max(2).optional().catch(undefined),
  hours: z
    .array(z.object({ from: z.number().int().min(0).max(23), to: z.number().int().min(0).max(23) }))
    .max(1)
    .optional()
    .catch(undefined),
});
export type PetScriptStoryMeta = z.infer<typeof petScriptStoryMetaSchema>;

/** 阶段 3：队列场景的剧情元数据（客户端排序用；标题由日记/场景 id 回填） */
export interface PetScriptSceneMeta {
  theme: string;
  tags: string[];
  /** 弱偏好：更适合的心情档位 */
  moods?: MotionMood[];
  /** 弱偏好：更适合的时段窗口 */
  hours?: { from: number; to: number }[];
}

/** 剧情状态摘要（客户端/面板只读展示） */
export interface PetScriptStorySummary {
  /** 未收线的线索数 */
  openThreads: number;
  /** 最近用过的主题（新→旧） */
  recentThemes: string[];
  /** 阶段 3：与 recentThemes 对齐的场景 id（播放时排除自身，避免自己匹配自己） */
  recentSceneIds?: string[];
  /** 当前待续接的悬念；null = 无 */
  cliffhanger: string | null;
  /** 已用梗标签（去重后的最近集合） */
  usedTags: string[];
  /** 最近用过的道具（新→旧，用于避免母题重复） */
  recentProps: string[];
}

export const EMPTY_STORY_SUMMARY: PetScriptStorySummary = {
  openThreads: 0,
  recentThemes: [],
  recentSceneIds: [],
  cliffhanger: null,
  usedTags: [],
  recentProps: [],
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
  /** 阶段 3：队列场景的 theme/tags 与弱偏好（sceneId → meta） */
  sceneMeta: Record<string, PetScriptSceneMeta>;
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
  /** 阶段 3：队列场景的 theme/tags 与弱偏好（sceneId → meta） */
  sceneMeta: Record<string, PetScriptSceneMeta>;
}

/** P8.5/P8.6：每日自动生成次数限制（设置页可配置，0 = 不生成） */
export const PET_SCRIPT_SCHEDULE_LIMITS = {
  defaultPerDay: 5,
  minPerDay: 0,
  maxPerDay: 24,
} as const;

/** P8.5：每日自动生成摘要（默认关闭） */
export interface PetScriptScheduleSummary {
  enabled: boolean;
  /** 每日计划次数（默认 5，可在设置页配置 0–24） */
  perDay: number;
  /** 今日已自动生成次数 */
  runsToday: number;
}

export interface PetScriptStatusView extends PetScriptGenerationView {
  schedule: PetScriptScheduleSummary;
}

export type PetScriptTickReason =
  | 'ok'
  | 'disabled'
  | 'quiet-hours'
  | 'not-due'
  | PetScriptGenerationReason;

/** POST /api/pet/script/tick：客户端心跳触发一次「到期检查」 */
export interface PetScriptTickResult extends PetScriptStatusView {
  triggered: boolean;
  reason: PetScriptTickReason;
  issues: string[];
}

/** P8.6：剧情日记保留天数候选（null = 永久保留，默认） */
export const PET_SCRIPT_JOURNAL_RETENTION_OPTIONS = [7, 30, 90, 365] as const;
export const PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS = 3650;
/** 默认永久保留（null），用户可在设置页改 */
export const PET_SCRIPT_JOURNAL_DEFAULT_RETENTION: number | null = null;

export interface PetScriptJournalSettings {
  /** 保留天数；null = 永久保留（默认） */
  retentionDays: number | null;
}

export const petScriptJournalSettingsSchema = z.object({
  retentionDays: z
    .number()
    .int()
    .min(1)
    .max(PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS)
    .nullable(),
});

/** P8.6：剧情日记条目（只记录 gen.* 生成场景） */
export interface PetScriptJournalItem {
  sceneId: string;
  /** 剧情短标题（生成时由模型给出） */
  title: string;
  /** 主题指纹 */
  theme: string;
  /** 场景挂载的触发键 */
  trigger: string;
  /** auto=定时窗口，manual=手动/事件生成 */
  source: 'auto' | 'manual';
  /** 生成时间（epoch ms） */
  generatedAt: number;
  /** 最近一次播放时间；null = 生成后还没播过 */
  playedAt: number | null;
  /** 播放次数（同一场重播累加） */
  playCount: number;
}

/** GET /api/pet/script/journal：某一天的回顾视图 */
export interface PetScriptJournalDay {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  /** 当天生成的场景，新→旧 */
  items: PetScriptJournalItem[];
  /** 当天生成场次 */
  generated: number;
  /** 当天生成且已播放过的场次 */
  played: number;
}

export const petScriptScheduleRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    perDay: z
      .number()
      .int()
      .min(PET_SCRIPT_SCHEDULE_LIMITS.minPerDay)
      .max(PET_SCRIPT_SCHEDULE_LIMITS.maxPerDay)
      .optional(),
  })
  .refine((value) => value.enabled !== undefined || value.perDay !== undefined, {
    message: 'enabled 与 perDay 至少提供一项',
  });
export type PetScriptScheduleRequest = z.infer<typeof petScriptScheduleRequestSchema>;

/** P8.8：主动播放预算（空闲触发、每日场次上限、勿扰与去重） */
export const PET_SCRIPT_PLAYBACK_LIMITS = {
  defaultPerDay: 3,
  minPerDay: 0,
  maxPerDay: 10,
  defaultIdleMinutes: 10,
  minIdleMinutes: 1,
  maxIdleMinutes: 120,
} as const;

export interface PetScriptPlaybackSummary {
  /** 每日主动播放上限（0 = 不主动播放） */
  perDay: number;
  /** 今日已主动播放场次 */
  playsToday: number;
  /** 空闲多少分钟后才触发 */
  idleMinutes: number;
  /** 今日已主动播放过的场景 id（去重，避免重复表演） */
  playedSceneIds: string[];
}

export type PetScriptPlaybackReason =
  | 'ok'
  | 'disabled'
  | 'daily-cap'
  | 'quiet-hours'
  | 'duplicate'
  | 'not-generated';

/** POST /api/pet/script/playback/claim：播放前认领一场（先扣预算再演出） */
export interface PetScriptPlaybackClaimResult {
  ok: boolean;
  reason: PetScriptPlaybackReason;
  /** 认领成功时回显场景 id */
  sceneId: string | null;
  playback: PetScriptPlaybackSummary;
}

export const petScriptPlaybackSettingsSchema = z
  .object({
    perDay: z
      .number()
      .int()
      .min(PET_SCRIPT_PLAYBACK_LIMITS.minPerDay)
      .max(PET_SCRIPT_PLAYBACK_LIMITS.maxPerDay)
      .optional(),
    idleMinutes: z
      .number()
      .int()
      .min(PET_SCRIPT_PLAYBACK_LIMITS.minIdleMinutes)
      .max(PET_SCRIPT_PLAYBACK_LIMITS.maxIdleMinutes)
      .optional(),
  })
  .refine((value) => value.perDay !== undefined || value.idleMinutes !== undefined, {
    message: 'perDay 与 idleMinutes 至少提供一项',
  });
export type PetScriptPlaybackSettings = z.infer<typeof petScriptPlaybackSettingsSchema>;

export const petScriptPlaybackClaimSchema = z.object({
  sceneId: z.string().trim().min(1).max(120),
});
export type PetScriptPlaybackClaim = z.infer<typeof petScriptPlaybackClaimSchema>;
