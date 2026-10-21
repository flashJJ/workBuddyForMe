import { z } from 'zod';
import {
  LANGUAGES,
  THEMES,
  THEME_IDS,
  CONTEXT_MESSAGES_MIN,
  CONTEXT_MESSAGES_MAX,
  GLOBAL_APPEND_PROMPT_MAX,
} from '../constants';
import { ACTION_CHAIN_IDS } from './interaction-chains';
import { isValidTriggerKey } from './interaction-graph';
import { motionMoodSchema } from './motion-asset';
import { RELATIONSHIP_LEVEL_NAMES } from './relationship-level';

/** v1.8 M4 音色收藏形状（M3 冻结数据契约；M4 才出 UI） */
export const voiceFavoriteSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(20),
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  voice: z.string().trim().min(1).max(80),
});
export type VoiceFavoriteInput = z.infer<typeof voiceFavoriteSchema>;

/**
 * v2.3：交互动画图的用户覆盖条目（settings JSON 持久化）。
 * chainId 必须在内置动作条目目录内；条件维度为关系等级门槛 / 情绪档位 / 时段。
 */
export const interactionGraphEntrySchema = z.object({
  key: z.string().trim().refine(isValidTriggerKey, { message: 'invalid touch trigger key' }),
  chainId: z.enum(ACTION_CHAIN_IDS),
  condition: z
    .object({
      minLevel: z.enum(RELATIONSHIP_LEVEL_NAMES).optional(),
      mood: motionMoodSchema.optional(),
      hours: z
        .object({
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
        })
        .optional(),
    })
    .optional(),
});
export type InteractionGraphOverride = z.infer<typeof interactionGraphEntrySchema>;

/** 覆盖条目上限（防配置膨胀失控） */
export const INTERACTION_GRAPH_OVERRIDES_MAX = 50;

export const settingsUpdateSchema = z.object({
  defaultChatModelId: z.string().trim().min(1).nullable().optional(),
  defaultEmbeddingModelId: z.string().trim().min(1).nullable().optional(),
  theme: z.enum(THEMES).optional(),
  // v1.8 命名主题（缺省 stellar；非 stellar 主题明暗由注册表固定）
  themeId: z.enum(THEME_IDS).optional(),
  language: z.enum(LANGUAGES).optional(),
  hasOnboarded: z.boolean().optional(),
  // v1.3 知识检索（缺省由 core 检索层给默认值：混合开/阈值 0.55/上限 8）
  hybridRetrievalEnabled: z.boolean().optional(),
  retrievalMinSimilarity: z.number().min(0).max(1).optional(),
  retrievalMaxChunks: z.number().int().min(1).max(20).optional(),
  // v1.3 编译优先检索路由（缺省 true；关=静态知识层零差异回落）
  compileRoutingEnabled: z.boolean().optional(),
  // v1.3 M4 知识编译调度
  autoCompile: z.boolean().optional(),
  compileWithLlm: z.boolean().optional(),
  compileModelId: z.string().trim().min(1).nullable().optional(),
  // v1.6 情绪内核总开关（缺省视为 true；关闭后不注入/不解析/不写情绪状态）
  emotionEnabled: z.boolean().optional(),
  // v2.0 关系等级（养成）开关（缺省视为 true；关闭后冻结等级演算/检查点/展示与解锁，
  // 不影响 v1.6 intimacy/trust 原始分；与 emotionEnabled 独立，可分别关闭）
  relationshipEnabled: z.boolean().optional(),
  // v1.6 M5 互动本地短句（摸头/久别迎接；缺省视为 true，关闭只留无声音的表情动作）
  interactionLinesEnabled: z.boolean().optional(),
  // v2.2 勿扰时段（缺省开启 23:00–06:00；关闭后任何时段都可交互）
  doNotDisturbEnabled: z.boolean().optional(),
  doNotDisturbStartHour: z.number().int().min(0).max(23).optional(),
  doNotDisturbEndHour: z.number().int().min(0).max(23).optional(),
  // v2.3 交互动画图覆盖条目（≤50；非法条目服务端丢弃）
  interactionGraphOverrides: z
    .array(interactionGraphEntrySchema)
    .max(INTERACTION_GRAPH_OVERRIDES_MAX)
    .optional(),
  // v2.3 内置动画图条目的停用列表（≤50；未知 id 服务端丢弃，见 isBuiltinEntryId）
  interactionGraphDisabledEntryIds: z
    .array(z.string().trim().min(1).max(80))
    .max(INTERACTION_GRAPH_OVERRIDES_MAX)
    .optional(),
  // v1.7 剧情事件总开关（缺省视为 true；出口/勿扰/对话锁仍由导演层兜底）
  eventsEnabled: z.boolean().optional(),
  // v1.7 主动频率档（冷却系数 1.5/1/0.6；缺省 standard）
  eventFrequencyTier: z.enum(['low', 'standard', 'high']).optional(),
  // v1.7 被用户停用的内置剧本 id（单条停用；缺省空=全部启用）
  disabledEventIds: z.array(z.string().min(3).max(80)).max(50).optional(),
  // v2.0 M3 系统事件感知授权（解锁/锁屏/系统空闲计时；缺省 false，必须用户显式开启。
  // 关闭时仅用应用内活动回落；原始信号不落盘，只产出剧本触发）
  systemEventAwarenessEnabled: z.boolean().optional(),
  // v1.8 M3：上下文条数（服务端钳制 2–50；先条数裁剪再 token 预算裁剪）
  contextMessageCount: z.number().int().min(CONTEXT_MESSAGES_MIN).max(CONTEXT_MESSAGES_MAX).optional(),
  // v1.8 M3：全局追加提示词（固定注入在角色卡之后、情绪段之前；空串=无内容）
  globalAppendPrompt: z.string().max(GLOBAL_APPEND_PROMPT_MAX).optional(),
  /** v1.8 M3：全局追加开关（内容为空时开关无效；缺省 false） */
  globalAppendPromptEnabled: z.boolean().optional(),
  // v1.8 M4：音色收藏（M3 仅冻结契约，≤20 条）
  voiceFavorites: z.array(voiceFavoriteSchema).max(20).optional(),
  // v2.4 M1：演示模式开关（开启时建内置 demo 供应商与 mock 模型；关闭时清理）
  demoModeEnabled: z.boolean().optional(),
  // v2.4 M1 T7：TTFV 里程碑（显式传 null 即清除；仅时间戳，不含对话内容）
  firstLaunchAt: z.number().int().nonnegative().nullable().optional(),
  firstModelReadyAt: z.number().int().nonnegative().nullable().optional(),
  firstAnswerAt: z.number().int().nonnegative().nullable().optional(),
  ttfvMs: z.number().int().nullable().optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
