import { z } from 'zod';
import { trashOrphanAttachments } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const schema = z.object({ names: z.array(z.string().min(1)).min(1).max(500) });

/** POST /api/storage/orphans/trash — 移动到 attachments/.trash/<date>/（不物理删除） */
export const POST = defineRoute(async ({ request, services }) => {
  const { names } = parseBody(schema, await readJsonBody(request));
  return jsonOk(trashOrphanAttachments(services.db, names));
});
