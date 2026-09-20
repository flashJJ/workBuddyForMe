import { z } from 'zod';
import { THEMES } from '../constants';

export const settingsUpdateSchema = z.object({
  defaultChatModelId: z.string().trim().min(1).nullable().optional(),
  defaultEmbeddingModelId: z.string().trim().min(1).nullable().optional(),
  theme: z.enum(THEMES).optional(),
  language: z.literal('zh-CN').optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
