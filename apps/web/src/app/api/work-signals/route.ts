import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/work-signals：当前工作信号快照（测试/降级轮询用） */
export const GET = defineRoute(({ services }) => jsonOk(services.workSignals.snapshot()));
