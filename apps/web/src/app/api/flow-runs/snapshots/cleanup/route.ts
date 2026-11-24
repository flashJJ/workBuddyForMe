import { snapshotCleanupRequestSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flow-runs/snapshots/cleanup：快照占用与配额 */
export const GET = defineRoute(({ services }) =>
  jsonOk(services.fileSafety.snapshotService.usage()),
);

/** POST /api/flow-runs/snapshots/cleanup：清理过期快照，支持 dry-run */
export const POST = defineRoute(async ({ request, services }) => {
  const body = parseBody(snapshotCleanupRequestSchema, await readJsonBody(request));
  const result = services.fileSafety.snapshotService.cleanup({ dryRun: body.dryRun });
  services.audit.safeAppend({
    kind: 'file_snapshot_cleanup',
    actor: 'system',
    reasonCode: 'file_snapshot_cleanup',
    outcome: JSON.stringify(result),
  });
  return jsonOk(result);
});
