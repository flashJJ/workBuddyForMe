import { z } from 'zod';
import { flowWebhookAuthSchema } from './run-reliability';

/**
 * v4.25 事件触发：Webhook 与本地文件监听。
 * 只定义输入契约；运行入参合并规则见 core trigger-service。
 */

export const flowTriggerKindSchema = z.enum(['webhook', 'file']);

export const flowFileTriggerConfigSchema = z.object({
  path: z.string().min(1).max(1024),
  extensions: z
    .array(z.string().regex(/^[a-z0-9]{1,16}$/, '扩展名需为小写字母或数字'))
    .min(1)
    .max(20),
  recursive: z.boolean().optional(),
});

export const flowTriggerCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('webhook'),
    name: z.string().trim().max(80).optional(),
    /** v5.0：bearer（默认）/hmac/both */
    auth: flowWebhookAuthSchema.optional(),
  }),
  z.object({
    kind: z.literal('file'),
    name: z.string().trim().max(80).optional(),
    config: flowFileTriggerConfigSchema,
  }),
]);

export const flowTriggerUpdateSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    enabled: z.boolean().optional(),
    config: flowFileTriggerConfigSchema.optional(),
    /** v5.0：Webhook 鉴权方式 */
    auth: flowWebhookAuthSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');

export type FlowTriggerCreateInput = z.infer<typeof flowTriggerCreateSchema>;
export type FlowTriggerUpdateInput = z.infer<typeof flowTriggerUpdateSchema>;
