import { backupExportRequestSchema } from '@wbfm/shared/backup';
import { exportBackup } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/backup/export — 全量/增量导出 tar.gz，直接返回二进制文件；可选密码加密 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(backupExportRequestSchema, await readJsonBody(request));
  const deps = { db: services.db, cipher: services.cipher };
  const { archive, manifest, encrypted, report, chain } = await exportBackup(deps, {
    tracks: input.tracks,
    password: input.password,
    mode: input.mode,
  });

  const suffix = encrypted ? '.tar.gz.enc' : '.tar.gz';
  const filename = `wbfm-backup-${manifest.backupSchemaVersion}-s${chain.sequence}-${manifest.createdAt.replace(/[:.]/g, '-')}${suffix}`;
  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': encrypted ? 'application/octet-stream' : 'application/gzip',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-backup-tracks': input.tracks.join(','),
      'x-backup-report': encodeURIComponent(JSON.stringify(report)),
      'x-backup-kind': chain.kind,
      'x-backup-sequence': String(chain.sequence),
      'x-backup-chain': chain.chainId,
      ...(encrypted ? { 'x-backup-encrypted': '1' } : {}),
    },
  });
});
