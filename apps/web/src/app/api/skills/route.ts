import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/skills：列出全部技能（skills_state join 磁盘扫描） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.skills.list());
});

/**
 * POST /api/skills：重新扫描技能目录（reconcile：播种内置 + 扫盘补登缺失文件夹），
 * 返回扫描后的最新列表。用于把新放入数据目录 skills/ 的技能包加载进来而无需重启。
 */
export const POST = defineRoute(({ services }) => {
  services.skills.reconcile();
  return jsonOk(services.skills.list());
});
