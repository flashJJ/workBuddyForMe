import { backupExportRequestSchema } from '@wbfm/shared/backup';
import { exportBackup } from '@wbfm/core/backup';
import { createSettingsRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/backup/export — 四轨导出 tar.gz，直接返回二进制文件供浏览器下载；可选密码加密 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(backupExportRequestSchema, await readJsonBody(request));
  const deps = { db: services.db, cipher: services.cipher };
  const { archive, manifest, encrypted, report } = await exportBackup(deps, {
    tracks: input.tracks,
    password: input.password,
  });

  // v2.33：最近一次导出摘要（不含路径与密码），供设置页「最近备份」卡片读取
  createSettingsRepository(services.db).setJson('backup.lastExport', {
    at: manifest.createdAt,
    encrypted,
    totalBytes: report.totalBytes,
    trackCount: report.tracks.length,
  });

  const suffix = encrypted ? '.tar.gz.enc' : '.tar.gz';
  const filename = `wbfm-backup-${manifest.backupSchemaVersion}-${manifest.createdAt.replace(/[:.]/g, '-')}${suffix}`;
  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': encrypted ? 'application/octet-stream' : 'application/gzip',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-backup-tracks': input.tracks.join(','),
      'x-backup-report': encodeURIComponent(JSON.stringify(report)),
      ...(encrypted ? { 'x-backup-encrypted': '1' } : {}),
    },
  });
});
