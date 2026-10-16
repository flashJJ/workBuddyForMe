/**
 * v1.7 剧情事件引擎契约（M1）。
 *
 * 纯声明式：step 是无副作用的数据，执行由 core EventRunner 解释；
 * 条件只允许白名单 path 的数值比较（见 docs/plan/v1.7/01）。
 * 本文件不依赖 React/DOM/时间，可在服务端与测试中直接使用。
 */
import { z } from 'zod';
import { EXPRESSION_TAGS, type ExpressionTag } from './expression';

// ── step 约束常量（引擎/播放器共用口径） ─────────────────
export const EVENT_MAX_STEPS = 24;
export const EVENT_MAX_BRANCHES = 4;
export const EVENT_MAX_DURATION_MS = 20_000;
export const EVENT_WAIT_MIN_MS = 100;
export const EVENT_WAIT_MAX_MS = 4_000;
export const EVENT_TTS_WAIT_MAX_MS = 30_000;
export const EVENT_QUEUE_LIMIT = 4;

/** fx 内置注册表（DOM/Canvas2D 实现，零三方粒子库；M2 落地） */
export const EVENT_FX_IDS = ['hearts', 'sweat', 'sparkle', 'fadeIn'] as const;
export type EventFxId = (typeof EVENT_FX_IDS)[number];

/** spatial 仅桌宠形态可演，主窗播放器收到一律 no-op */
export const EVENT_SPATIAL_ACTIONS = ['slideIn', 'slideOut', 'hop'] as const;
export type EventSpatialAction = (typeof EVENT_SPATIAL_ACTIONS)[number];

/** motion v1 仅开放 tap 组（idle 由微动作自动调度，不接受剧本寻址） */
export const EVENT_MOTION_GROUPS = ['tap'] as const;
export type EventMotionGroup = (typeof EVENT_MOTION_GROUPS)[number];

export type EventInterruptPolicy = 'ignore' | 'replaceLowerPriority' | 'replace';
export type EventSpeechLock = 'queue' | 'skip';

// ── step 联合 ────────────────────────────────────────────
const expressionStepSchema = z.object({
  kind: z.literal('expression'),
  tag: z.enum(EXPRESSION_TAGS),
  /** 缺省=常驻到演出结束；显式闪现到期回基线 */
  durationMs: z.number().int().positive().max(EVENT_MAX_DURATION_MS).optional(),
});

const motionStepSchema = z.object({
  kind: z.literal('motion'),
  group: z.enum(EVENT_MOTION_GROUPS),
});

const gazeStepSchema = z.object({
  kind: z.literal('gaze'),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
});

const speechStepSchema = z.object({
  kind: z.literal('speech'),
  /** i18n 键（event.* 命名）；无变量插值 */
  lineKey: z.string().min(1).max(120),
  /** 缺省 true；false=仅气泡字幕不出声（高频互动防腻） */
  tts: z.boolean().optional(),
});

const waitStepSchema = z.object({
  kind: z.literal('wait'),
  ms: z.number().int().min(EVENT_WAIT_MIN_MS).max(EVENT_WAIT_MAX_MS),
});

export const conditionOps = ['gt', 'gte', 'lt', 'lte', 'eq'] as const;
export type ConditionOp = (typeof conditionOps)[number];

/**
 * 白名单条件：仅数值比较。path 合法集由引擎 conditions 模块逐段校验，
 * schema 只锁形状（path 为点分小写标识符），非法 path 在求值期按 false 处理。
 */
export const eventConditionSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/, '非法条件路径'),
  op: z.enum(conditionOps),
  value: z.number().finite(),
});
export type EventCondition = z.infer<typeof eventConditionSchema>;

const branchStepSchema = z.object({
  kind: z.literal('branch'),
  /** AND 语义，全部满足才跳转；空数组=无条件跳转（支线汇合） */
  when: z.array(eventConditionSchema).max(4),
  /** 目标 step 下标，引擎校验必须大于当前下标（无循环） */
  goto: z.number().int().nonnegative(),
});

const fxStepSchema = z.object({
  kind: z.literal('fx'),
  id: z.enum(EVENT_FX_IDS),
});

const spatialStepSchema = z.object({
  kind: z.literal('spatial'),
  action: z.enum(EVENT_SPATIAL_ACTIONS),
});

export const eventStepSchema = z.discriminatedUnion('kind', [
  expressionStepSchema,
  motionStepSchema,
  gazeStepSchema,
  speechStepSchema,
  waitStepSchema,
  branchStepSchema,
  fxStepSchema,
  spatialStepSchema,
]);
export type EventStep = z.infer<typeof eventStepSchema>;

// ── 剧本定义 ─────────────────────────────────────────────
export const EVENT_PRIORITIES = [1, 2, 3] as const;
export type EventPriority = (typeof EVENT_PRIORITIES)[number];

export const eventDefinitionSchema = z
  .object({
    /** 点分 id：内置 ev.*，用户自建 usr.* */
    id: z
      .string()
      .min(3)
      .max(80)
      .regex(/^(ev|usr)\.[a-z0-9]+(?:\.[a-z0-9]+)*$/),
    titleKey: z.string().min(1).max(120),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    interruptPolicy: z.enum(['ignore', 'replaceLowerPriority', 'replace']),
    /** 同 id 两次 played 的最小间隔（毫秒） */
    cooldownMs: z.number().int().min(0).max(7 * 24 * 3600_000),
    maxPerDay: z.number().int().min(1).max(50).optional(),
    /** speech 遇 TTS 锁：queue=等待授权，skip=跳过出声（视觉照演） */
    speechLock: z.enum(['queue', 'skip']),
    builtIn: z.boolean().optional(),
    /**
     * v1.7 M5：演出完整播完（outcome=played）后的情绪联动。
     * praise=庆祝/被夸/迎接（+开心+亲密）；comfort=生气哄好（−难过+小幅回暖）。
     * 跳过/打断不施加；suppressed 更不施加。
     */
    emotionOnPlayed: z
      .object({
        type: z.enum(['praise', 'comfort']),
      })
      .optional(),
    /**
     * v2.0：开演最低关系等级（0 陌生 / 1 认识 / 2 搭档 / 3 挚友）。
     * 与 branch 条件的 relationship.level 路径同源，这是定义级快捷闸门；
     * 缺省 0=不限制。仅内置等级剧本使用（用户剧本走 branch）。
     */
    minRelationshipLevel: z.number().int().min(0).max(3).optional(),
    steps: z.array(eventStepSchema).min(1).max(EVENT_MAX_STEPS),
  })
  /**
   * 跨字段规则：branch 只前跳、数量上限、总步长看门狗。
   * 不通过即拒绝整个剧本（非法剧本不入注册表，而非运行期容错）。
   */
  .superRefine((def, ctx) => {
    let branches = 0;
    def.steps.forEach((step, index) => {
      if (step.kind !== 'branch') return;
      branches += 1;
      if (step.goto <= index) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'goto'],
          message: 'branch.goto 必须大于当前下标（禁止循环）',
        });
      }
      if (step.goto >= def.steps.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'goto'],
          message: 'branch.goto 超出 steps 范围',
        });
      }
    });
    if (branches > EVENT_MAX_BRANCHES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps'],
        message: `单个剧本 branch 不得超过 ${EVENT_MAX_BRANCHES} 个`,
      });
    }
  });
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;

// ── 演出结果与抑制原因（event_usage 落库口径，M4 接仓储） ──
export const EVENT_RUN_OUTCOMES = ['played', 'skipped', 'interrupted', 'suppressed'] as const;
export type EventRunOutcome = (typeof EVENT_RUN_OUTCOMES)[number];

export const EVENT_SUPPRESS_REASONS = [
  'master_off',
  'quiet_hours',
  'cooldown',
  'daily_cap',
  'frequency_tier',
  'queue_full',
  'no_outlet',
  'ignored',
  /** v2.0：展示等级未达剧本 minRelationshipLevel */
  'relationship_locked',
] as const;
export type EventSuppressReason = (typeof EVENT_SUPPRESS_REASONS)[number];

/** 打断/跳过/超时原因（interrupted/skipped 结果的 reason） */
export const EVENT_END_REASONS = [
  'user_skip',
  'conv_start',
  'higher_priority',
  'watchdog',
  'speech_wait_timeout',
] as const;
export type EventEndReason = (typeof EVENT_END_REASONS)[number];

/** 频率档：准入时对剧本 cooldownMs 乘的系数 */
export const EVENT_FREQUENCY_TIERS = ['low', 'standard', 'high'] as const;
export type EventFrequencyTier = (typeof EVENT_FREQUENCY_TIERS)[number];
export const EVENT_FREQUENCY_FACTORS: Record<EventFrequencyTier, number> = {
  low: 1.5,
  standard: 1,
  high: 0.6,
};

export type { ExpressionTag };
