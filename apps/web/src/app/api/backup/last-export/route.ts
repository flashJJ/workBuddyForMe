import { backupLastExportSchema, type BackupLastExport } from '@wbfm/shared/backup';
import { createSettingsRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/backup/last-export — 设置页「最近备份」卡片（只读设置项 backup.lastExport） */
export const GET = defineRoute(({ services }) => {
  const raw = createSettingsRepository(services.db).getJson<unknown>('backup.lastExport', null);
  const parsed = backupLastExportSchema.safeParse(raw);
  return jsonOk({ lastExport: parsed.success ? (parsed.data as BackupLastExport) : null });
});
