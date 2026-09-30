import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/stop-all：急停全部活跃任务（desktop 全局热键 Ctrl+Alt+Esc 触发）。
 * 无活跃任务时返回 count=0（幂等）。
 */
export const POST = defineRoute(({ services }) => {
  const count = services.taskRunner.stopAll();
  return jsonOk({ stopped: count });
});
