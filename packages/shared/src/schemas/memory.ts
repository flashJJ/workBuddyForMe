import { z } from 'zod';
import { MEMORY_KINDS, MEMORY_STATUSES, type MemoryKind, type MemoryStatus } from '../types/domain';

const kindSchema = z.enum([...MEMORY_KINDS] as [MemoryKind, ...MemoryKind[]]);
const statusSchema = z.enum([...MEMORY_STATUSES] as [MemoryStatus, ...MemoryStatus[]]);
const contentSchema = z.string().trim().min(1, '记忆内容不能为空').max(500, '记忆内容最长 500 字符');
const importanceSchema = z.number().min(0).max(1).default(0.5);

/** 管理 UI 手工新建记忆 */
export const memoryCreateSchema = z.object({
  kind: kindSchema,
  content: contentSchema,
  importance: importanceSchema,
  sourceConversationId: z.string().trim().min(1).nullable().optional(),
});
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>;

/** 管理 UI 编辑记忆（内容/类别/重要性/归档状态） */
export const memoryUpdateSchema = z
  .object({
    kind: kindSchema.optional(),
    content: contentSchema.optional(),
    importance: importanceSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type MemoryUpdateInput = z.infer<typeof memoryUpdateSchema>;
