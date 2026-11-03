import { z } from 'zod';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from '../../constants/index';

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

/** v2.18 M4：内容包导入请求（只允许清单内 id） */
export const contentPackImportSchema = z.object({
  id: z.string().trim().min(1, '内容包 id 不能为空').max(64),
});
export type ContentPackImportInput = z.infer<typeof contentPackImportSchema>;

/** v2.19 M3：跨文档对比请求（两份不同文档，产物格式 Markdown/HTML） */
export const documentCompareSchema = z
  .object({
    leftDocumentId: z.string().trim().min(1).max(64),
    rightDocumentId: z.string().trim().min(1).max(64),
    format: z.enum(['md', 'html']).default('html'),
    locale: z.enum(['zh', 'en']).default('zh'),
  })
  .refine((value) => value.leftDocumentId !== value.rightDocumentId, {
    message: '请选择两份不同的文档',
    path: ['rightDocumentId'],
  });
export type DocumentCompareInput = z.infer<typeof documentCompareSchema>;

/** v2.19 M4：按需解读图注/图表（结构块 id 形如 b3） */
export const figureSummarySchema = z.object({
  blockId: z
    .string()
    .trim()
    .regex(/^b[1-9]\d*$/, '结构块 id 必须形如 b3'),
});
export type FigureSummaryBody = z.infer<typeof figureSummarySchema>;

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
