import { z } from 'zod';

/** 路径参数 id */
export const idParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
});
export type IdParam = z.infer<typeof idParamSchema>;

/** 可选分页 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const sortOrderSchema = z.number().int().min(0).default(0);
