import { z } from 'zod';
import { LANGUAGES, THEMES, THEME_IDS } from '../constants';

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
  // v1.6 M5 互动本地短句（摸头/久别迎接；缺省视为 true，关闭只留无声音的表情动作）
  interactionLinesEnabled: z.boolean().optional(),
  // v1.7 剧情事件总开关（缺省视为 true；出口/勿扰/对话锁仍由导演层兜底）
  eventsEnabled: z.boolean().optional(),
  // v1.7 主动频率档（冷却系数 1.5/1/0.6；缺省 standard）
  eventFrequencyTier: z.enum(['low', 'standard', 'high']).optional(),
  // v1.7 被用户停用的内置剧本 id（单条停用；缺省空=全部启用）
  disabledEventIds: z.array(z.string().min(3).max(80)).max(50).optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
