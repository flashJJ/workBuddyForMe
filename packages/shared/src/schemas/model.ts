import { z } from 'zod';
import { MODEL_CAPABILITIES } from '../constants';

export const modelCapabilitySchema = z.enum(MODEL_CAPABILITIES);

export const modelCreateSchema = z.object({
  modelId: z.string().trim().min(1, '模型 ID 不能为空').max(120),
  displayName: z.string().trim().max(120).optional(),
  capabilities: z.array(modelCapabilitySchema).min(1, '至少选择一种能力').default(['chat']),
  contextWindow: z.number().int().positive().nullable().optional(),
});
export type ModelCreateInput = z.infer<typeof modelCreateSchema>;
