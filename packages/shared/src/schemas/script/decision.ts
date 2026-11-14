import { z } from 'zod';

/**
 * v3.0 M3：Utility 决策记录。
 *
 * 只记录实际开演的场次（主动播放/触发/低语），用于设置页解释「为什么演这条」；
 * 被硬门控或预算拒绝的候选只在 dev 日志出现，不进入持久化。
 */

export const PET_SCRIPT_DECISION_SOURCES = ['proactive', 'trigger', 'ambient'] as const;
export type PetScriptDecisionSource = (typeof PET_SCRIPT_DECISION_SOURCES)[number];

export const PET_SCRIPT_DECISION_WORK_STATES = ['idle', 'busy', 'away', 'unknown'] as const;
export type PetScriptDecisionWorkState = (typeof PET_SCRIPT_DECISION_WORK_STATES)[number];

/** 理由码白名单：阶段 1 先落地时段/心情/关系/工作/空闲/新鲜度/道具去重 */
export const PET_SCRIPT_DECISION_REASON_CODES = [
  'hour:late-night',
  'hour:work-hours',
  'mood:calm',
  'mood:lively',
  'level:partner',
  'work:busy-short',
  'work:idle-companion',
  'idle:long',
  'fresh:unplayed',
  'dedupe:prop',
  'cost:long-scene',
] as const;
export type PetScriptDecisionReasonCode = (typeof PET_SCRIPT_DECISION_REASON_CODES)[number];

export const PET_SCRIPT_DECISION_LIMITS = {
  /** settings_kv 保留的决策条数 */
  maxStored: 20,
  /** 设置页展示条数 */
  visible: 5,
  /** 单条决策最多理由数 */
  maxReasons: 6,
} as const;

export interface PetScriptDecisionReason {
  code: PetScriptDecisionReasonCode;
  /** 加权后的正负增量，保留 3 位小数 */
  delta: number;
}

export interface PetScriptDecisionContext {
  /** 本地小时 0–23 */
  hour: number;
  /** 实际空闲分钟数（桌宠窗口内） */
  idleMinutes: number;
  /** 关系等级 0–3 */
  level: number;
  /** 情绪档位 good/normal/low */
  mood: string;
  /** 工作信号粗粒度状态 */
  work: PetScriptDecisionWorkState;
}

export interface PetScriptDecisionRecord {
  /** 开演时间（epoch ms） */
  at: number;
  sceneId: string;
  /** gen.* 由剧情日记补标题；手写场景回退 id */
  title: string;
  source: PetScriptDecisionSource;
  /** 加权总分 0–1 */
  score: number;
  reasons: PetScriptDecisionReason[];
  context: PetScriptDecisionContext;
}

export interface PetScriptDecisionView {
  /** 新→旧 */
  decisions: PetScriptDecisionRecord[];
}

export const petScriptDecisionReasonSchema = z.object({
  code: z.enum(PET_SCRIPT_DECISION_REASON_CODES),
  delta: z.number().min(-1).max(1),
});

export const petScriptDecisionContextSchema = z.object({
  hour: z.number().int().min(0).max(23),
  idleMinutes: z.number().int().min(0).max(1440),
  level: z.number().int().min(0).max(3),
  mood: z.string().trim().min(1).max(24),
  work: z.enum(PET_SCRIPT_DECISION_WORK_STATES),
});

/** 桌宠上报用：at/title 由服务端补，客户端不伪造 */
export const petScriptDecisionReportSchema = z.object({
  sceneId: z.string().trim().min(1).max(120),
  source: z.enum(PET_SCRIPT_DECISION_SOURCES),
  score: z.number().min(0).max(1),
  reasons: z
    .array(petScriptDecisionReasonSchema)
    .min(1)
    .max(PET_SCRIPT_DECISION_LIMITS.maxReasons),
  context: petScriptDecisionContextSchema,
});
export type PetScriptDecisionReport = z.infer<typeof petScriptDecisionReportSchema>;

/** 持久化校验：坏记录逐条丢弃 */
export const petScriptDecisionRecordSchema = z.object({
  at: z.number().int().positive(),
  sceneId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  source: z.enum(PET_SCRIPT_DECISION_SOURCES),
  score: z.number().min(0).max(1),
  reasons: z
    .array(petScriptDecisionReasonSchema)
    .min(1)
    .max(PET_SCRIPT_DECISION_LIMITS.maxReasons),
  context: petScriptDecisionContextSchema,
});
