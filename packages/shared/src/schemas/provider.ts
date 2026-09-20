import { z } from 'zod';
import { PROVIDER_PROTOCOLS } from '../constants';

export const providerProtocolSchema = z.enum(PROVIDER_PROTOCOLS);

const baseUrlSchema = z
  .string()
  .trim()
  .url('baseUrl 必须是合法 URL')
  .refine((v) => v.startsWith('http://') || v.startsWith('https://'), '仅支持 http/https 协议');

const nameSchema = z.string().trim().min(1, '名称不能为空').max(60, '名称最长 60 字符');
const apiKeySchema = z.string().trim().max(300);

/** 新建供应商（apiKey 可为空串，适配本地无鉴权服务） */
export const providerCreateSchema = z.object({
  name: nameSchema,
  protocol: providerProtocolSchema.default('openai-compatible'),
  baseUrl: baseUrlSchema,
  apiKey: apiKeySchema.default(''),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;

/** 更新供应商：apiKey 缺省表示保留原 Key；空串不允许 */
export const providerUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    protocol: providerProtocolSchema.optional(),
    baseUrl: baseUrlSchema.optional(),
    apiKey: apiKeySchema.optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;

/** 连接测试允许直接使用临时未保存的配置（设置页未保存先测试） */
export const providerTestSchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z.object({
    protocol: providerProtocolSchema,
    baseUrl: baseUrlSchema,
    apiKey: apiKeySchema,
  }),
]);
export type ProviderTestInput = z.infer<typeof providerTestSchema>;
