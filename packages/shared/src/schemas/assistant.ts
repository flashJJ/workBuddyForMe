import { z } from 'zod';
import { QUALIFIED_TOOL_NAME_PATTERN } from '../constants';

const nameSchema = z.string().trim().min(1, '助手名称不能为空').max(60);

/** v0.6：元素为内置工具名或 mcp:<server>:<tool>，白名单上限不变 */
const enabledToolsSchema = z
  .array(z.string().regex(QUALIFIED_TOOL_NAME_PATTERN, '工具名格式不合法'))
  .max(20, '工具数量超限')
  .default(['current_time']);
const retrieveAlwaysSchema = z.boolean().default(true);
/** v0.5：长期记忆开关默认开启 */
const memoryEnabledSchema = z.boolean().default(true);
/** v1.0 M3：表情指令标签开关默认开启（形象关闭时标签也不上屏/不出声） */
const expressionEnabledSchema = z.boolean().default(true);
/** v1.7：人格权重 0..1（缺省 0.5；驱动剧本 branch 支线） */
const personalityWeightSchema = z.number().min(0).max(1).default(0.5);

const samplingFields = {
  emoji: z.string().trim().max(8).nullable().default(null),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB')
    .nullable()
    .default(null),
  systemPrompt: z.string().max(8000, '系统提示词最长 8000 字符').default(''),
  temperature: z.number().min(0).max(2).default(1),
  topP: z.number().min(0).max(1).default(1),
  maxTokens: z.number().int().positive().max(1_000_000).nullable().default(null),
  modelId: z.string().trim().min(1).nullable().default(null),
  /** v1.4：协作三角色模型覆盖；留空=跟随助手默认/系统默认 */
  plannerModelId: z.string().trim().min(1).nullable().default(null),
  executorModelId: z.string().trim().min(1).nullable().default(null),
  reviewerModelId: z.string().trim().min(1).nullable().default(null),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).max(10).default([]),
  enabledTools: enabledToolsSchema,
  retrieveAlways: retrieveAlwaysSchema,
  memoryEnabled: memoryEnabledSchema,
  expressionEnabled: expressionEnabledSchema,
  // v1.7：人格四权重（坦率/傲娇/害羞/包容）
  personalityFrankness: personalityWeightSchema,
  personalityTsundere: personalityWeightSchema,
  personalityShy: personalityWeightSchema,
  personalityTolerance: personalityWeightSchema,
  // v1.8：当前选用的角色卡 id（null=使用默认卡/不启用卡）
  cardId: z.string().trim().min(1).nullable().default(null),
};

export const assistantCreateSchema = z.object({
  name: nameSchema,
  ...samplingFields,
  sortOrder: z.number().int().min(0).default(0),
});
export type AssistantCreateInput = z.infer<typeof assistantCreateSchema>;

export const assistantUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    emoji: samplingFields.emoji.optional(),
    color: samplingFields.color.optional(),
    systemPrompt: samplingFields.systemPrompt.optional(),
    temperature: samplingFields.temperature.optional(),
    topP: samplingFields.topP.optional(),
    maxTokens: samplingFields.maxTokens.optional(),
    modelId: samplingFields.modelId.optional(),
    knowledgeBaseIds: samplingFields.knowledgeBaseIds.optional(),
    enabledTools: samplingFields.enabledTools.optional(),
    retrieveAlways: samplingFields.retrieveAlways.optional(),
    memoryEnabled: samplingFields.memoryEnabled.optional(),
    expressionEnabled: samplingFields.expressionEnabled.optional(),
    personalityFrankness: samplingFields.personalityFrankness.optional(),
    personalityTsundere: samplingFields.personalityTsundere.optional(),
    personalityShy: samplingFields.personalityShy.optional(),
    personalityTolerance: samplingFields.personalityTolerance.optional(),
    cardId: samplingFields.cardId.optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type AssistantUpdateInput = z.infer<typeof assistantUpdateSchema>;

export const assistantReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});
export type AssistantReorderInput = z.infer<typeof assistantReorderSchema>;
