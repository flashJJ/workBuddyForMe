import { skillVersionParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** DELETE /api/skills/:name/versions/:version：删除非启用版本快照（只读审计记录不含路径） */
export const DELETE = defineRoute(({ params, services }) => {
  const { name, version } = parseParams(skillVersionParamSchema, {
    name: params.id,
    version: params.version,
  });
  const result = services.skills.deleteVersion(name, version);
  services.audit.safeAppend({
    kind: 'skill_version_deleted',
    actor: 'user',
    outcome: `${name}@${version}`,
  });
  return jsonOk(result);
});
