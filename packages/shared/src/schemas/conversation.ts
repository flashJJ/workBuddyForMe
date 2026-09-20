import { z } from 'zod';

export const conversationCreateSchema = z.object({
  assistantId: z.string().trim().min(1, '必须选择助手'),
  title: z.string().trim().max(120).optional(),
});
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;

export const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(120),
});
export type ConversationUpdateInput = z.infer<typeof conversationUpdateSchema>;

/** SSE 流式对话入参：conversationId 缺省时由服务端新建会话 */
export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  assistantId: z.string().trim().min(1, '必须选择助手'),
  content: z.string().trim().min(1, '消息内容不能为空').max(100_000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
