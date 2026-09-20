import { z } from 'zod';

const nameSchema = z.string().trim().min(1, '助手名称不能为空').max(60);

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
  knowledgeBaseId: z.string().trim().min(1).nullable().default(null),
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
    knowledgeBaseId: samplingFields.knowledgeBaseId.optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type AssistantUpdateInput = z.infer<typeof assistantUpdateSchema>;

export const assistantReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});
export type AssistantReorderInput = z.infer<typeof assistantReorderSchema>;
