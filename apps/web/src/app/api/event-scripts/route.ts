import { createInstalledEventScriptRepository } from '@wbfm/database';
import { eventScriptCapabilityPayloadSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';

/** v2.11：启用中的能力包剧本（客户端短语触发匹配用；只读） */
export const GET = defineRoute(({ services }) => {
  const repo = createInstalledEventScriptRepository(services.db);
  const items = repo.listEnabled().flatMap((row) => {
    try {
      const payload = eventScriptCapabilityPayloadSchema.parse(JSON.parse(row.definitionJson));
      return [
        {
          id: row.id,
          name: row.name,
          packId: row.packId,
          definition: payload.definition,
          phrases: payload.trigger.phrases,
        },
      ];
    } catch {
      return [];
    }
  });
  return jsonOk(items);
});
