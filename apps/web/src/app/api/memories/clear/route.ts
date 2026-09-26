import { memoryClearSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * 物理清空全部记忆（主表 + memories_vec）。
 * 危险操作：UI 必须二次确认；当前不支持按范围清空，请求体仅为向前兼容预留。
 */
export const POST = defineRoute(async ({ request, services }) => {
  parseBody(memoryClearSchema, await readJsonBody(request));
  const removed = services.memories.clearAll();
  return jsonOk({ removed });
});
