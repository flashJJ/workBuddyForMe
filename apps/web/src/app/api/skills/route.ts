import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/skills：列出全部技能（skills_state join 磁盘扫描） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.skills.list());
});
