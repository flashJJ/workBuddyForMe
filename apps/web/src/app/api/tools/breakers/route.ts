import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const resetSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/** GET /api/tools/breakers：列出当前熔断中的工具（含 half-open 状态） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.breakers.listTripped());
});

/** POST /api/tools/breakers：重置单个工具的熔断状态（幂等：不存在视为已重置） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(resetSchema, await readJsonBody(request));
  services.breakers.reset(input.name);
  return jsonOk({ name: input.name, ok: true });
});
