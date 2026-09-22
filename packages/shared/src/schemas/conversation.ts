import { z } from 'zod';
import { MAX_CHAT_ATTACHMENTS } from '../constants';

export const conversationCreateSchema = z.object({
  assistantId: z.string().trim().min(1, '必须选择助手'),
  title: z.string().trim().max(120).optional(),
});
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;

export const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(120),
});
export type ConversationUpdateInput = z.infer<typeof conversationUpdateSchema>;

/**
 * SSE 流式对话入参：conversationId 缺省时由服务端新建会话。
 * v0.3：允许「纯图片」消息（content 为空、attachments 非空）。
 */
export const chatRequestSchema = z
  .object({
    conversationId: z.string().trim().min(1).optional(),
    assistantId: z.string().trim().min(1, '必须选择助手'),
    content: z.string().trim().max(100_000).default(''),
    /** v0.3：有序图片附件 ID（POST /api/attachments 先行上传） */
    attachments: z
      .array(z.string().trim().min(1))
      .max(MAX_CHAT_ATTACHMENTS, `单条消息最多 ${MAX_CHAT_ATTACHMENTS} 张图片`)
      .optional(),
    /** v0.2：重新生成——沿用上一条用户消息重跑（需已有会话） */
    regenerate: z.boolean().optional(),
  })
  .refine((v) => v.content.length > 0 || (v.attachments?.length ?? 0) > 0, {
    message: '消息内容不能为空',
    path: ['content'],
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;
