import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { readSpill } from '@wbfm/core/tools';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ hash: z.string().min(1) });

/** v2.9：读取大工具输出溢出全文（仅 64 位 hex 哈希） */
export const GET = defineRoute(({ params }) => {
  const { hash } = parseParams(paramsSchema, params);
  const text = readSpill(hash);
  if (text === null) throw ApiError.notFound('溢出内容', hash);
  return new Response(text, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
});
