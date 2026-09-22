import { backupExportRequestSchema } from '@wbfm/shared';
import { exportBackup } from '@wbfm/core';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/backup/export — 四轨导出 tar.gz，直接返回二进制文件供浏览器下载 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(backupExportRequestSchema, await readJsonBody(request));
  const deps = { db: services.db, cipher: services.cipher };
  const { archive, manifest } = await exportBackup(deps, { tracks: input.tracks });

  const filename = `wbfm-backup-${manifest.backupSchemaVersion}-${manifest.createdAt.replace(/[:.]/g, '-')}.tar.gz`;
  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-backup-tracks': input.tracks.join(','),
    },
  });
});
