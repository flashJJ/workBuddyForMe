import { z } from 'zod';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from '../constants';

export const knowledgeBaseCreateSchema = z.object({
  name: z.string().trim().min(1, '知识库名称不能为空').max(60),
  description: z.string().trim().max(500).default(''),
  chunkSize: z.number().int().min(MIN_CHUNK_SIZE).max(MAX_CHUNK_SIZE).default(DEFAULT_CHUNK_SIZE),
  chunkOverlap: z.number().int().min(0).max(500).default(DEFAULT_CHUNK_OVERLAP),
});
export type KnowledgeBaseCreateInput = z.infer<typeof knowledgeBaseCreateSchema>;

export const knowledgeBaseUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(500).optional(),
    chunkSize: z.number().int().min(MIN_CHUNK_SIZE).max(MAX_CHUNK_SIZE).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type KnowledgeBaseUpdateInput = z.infer<typeof knowledgeBaseUpdateSchema>;
