import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/**
 * v1.7 tick 第一步：列出 enabled 且 next_run_at <= now 的提醒。
 * 渲染进程 10s 心跳调用；随后逐条 POST /fire 完成「先标记后投递」。
 */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.schedules.listDue());
});
