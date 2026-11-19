import { memoryClearSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * 物理清空记忆（主表 + memories_vec + 边 + 审计事件）。
 * v4.12：请求体可带 status 只清某一状态（如 archived）；缺省清空全部。
 * 危险操作：UI 必须二次确认。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(memoryClearSchema, await readJsonBody(request));
  const removed = input.status
    ? services.memories.clearByStatus(input.status)
    : services.memories.clearAll();
  return jsonOk({ removed });
});
