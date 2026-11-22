import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v4.21：最近召回解释轨迹（只读元数据，最近 5 次） */
export const GET = defineRoute(({ request, services }) => {
  const raw = Number(new URL(request.url).searchParams.get('limit') ?? 5);
  const limit = Number.isFinite(raw) ? Math.min(5, Math.max(1, Math.floor(raw))) : 5;
  return jsonOk({ traces: services.memories.getRecallTraces(limit) });
});
