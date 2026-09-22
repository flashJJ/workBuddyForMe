import { ApiError } from '@wbfm/shared';
import { precheckBackup, restoreBackup } from '@wbfm/core';
import { defineRoute } from '@/lib/server/with-api-handler';
import { readUploadPart } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 500 * 1024 * 1024; // 500MB（与 core BACKUP_MAX_ARCHIVE_BYTES 一致）

/** POST /api/backup/restore — 上传 tar.gz 归档，precheck + restore，返回导入统计 */
export const POST = defineRoute(async ({ request, services }) => {
  const upload = await readUploadPart(request, MAX_BACKUP_BYTES);
  const archive = Buffer.from(upload.buffer);

  // 先 precheck：版本兼容 + 统计条目 + 脱敏警告
  const precheck = await precheckBackup(archive);
  if (!precheck.compatible) {
    throw new ApiError('VALIDATION_ERROR', `备份版本不兼容：${precheck.warnings[0] ?? '请升级应用后再恢复'}`, {
      precheck,
    });
  }

  // 正式恢复
  const deps = { db: services.db, cipher: services.cipher };
  const result = await restoreBackup(deps, archive);

  return Response.json({ ok: true, precheck, result });
});
