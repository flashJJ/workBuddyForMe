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

/** v1.3：知识编译触发请求（M3；M4 队列化后 body 形状保持兼容） */
export const compileRequestSchema = z
  .object({
    scope: z.enum(['new', 'all', 'document']).default('new'),
    documentId: z.string().trim().min(1).optional(),
    withLlm: z.boolean().optional(),
  })
  .refine((v) => v.scope !== 'document' || Boolean(v.documentId), {
    message: 'scope=document 时必须提供 documentId',
    path: ['documentId'],
  });
export type CompileRequest = z.infer<typeof compileRequestSchema>;

/** v0.3 网页剪藏请求 */
export const clipRequestSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, '请填写网页地址')
    .max(2000)
    .refine((v) => /^https?:\/\//i.test(v), '网址必须以 http:// 或 https:// 开头'),
});
export type ClipRequest = z.infer<typeof clipRequestSchema>;
