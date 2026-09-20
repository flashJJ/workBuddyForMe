import { ApiError } from '@wbfm/shared';
import type { z } from 'zod';

/** 读取 JSON body；空体返回 undefined，非法 JSON 返回 422 */
export async function readJsonBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const text = await request.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', '请求体不是合法的 JSON');
  }
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body ?? {});
}

export function parseSearch<T extends z.ZodTypeAny>(
  schema: T,
  url: URL,
): z.infer<T> {
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

export function parseParams<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string | undefined>,
): z.infer<T> {
  return schema.parse(params);
}
