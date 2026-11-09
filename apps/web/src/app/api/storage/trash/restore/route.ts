import { z } from 'zod';
import { restoreFromTrash } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
});

/** POST /api/storage/trash/restore — 7 天内按清单重建附件行并移回文件 */
export const POST = defineRoute(async ({ request, services }) => {
  const { date, name } = parseBody(schema, await readJsonBody(request));
  return jsonOk(restoreFromTrash(services.db, date, name));
});
