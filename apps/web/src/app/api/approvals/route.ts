import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/approvals：待处理审批列表（审批中心/桌宠兜底轮询用） */
export const GET = defineRoute(({ services }) =>
  jsonOk({ approvals: services.approvals.list() }),
);
