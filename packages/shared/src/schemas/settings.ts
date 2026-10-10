import { z } from 'zod';
import { LANGUAGES, THEMES } from '../constants';

export const settingsUpdateSchema = z.object({
  defaultChatModelId: z.string().trim().min(1).nullable().optional(),
  defaultEmbeddingModelId: z.string().trim().min(1).nullable().optional(),
  theme: z.enum(THEMES).optional(),
  language: z.enum(LANGUAGES).optional(),
  hasOnboarded: z.boolean().optional(),
  // v1.3 知识检索（缺省由 core 检索层给默认值：混合开/阈值 0.55/上限 8）
  hybridRetrievalEnabled: z.boolean().optional(),
  retrievalMinSimilarity: z.number().min(0).max(1).optional(),
  retrievalMaxChunks: z.number().int().min(1).max(20).optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
