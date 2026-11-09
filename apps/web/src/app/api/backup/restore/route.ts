import { ApiError } from '@wbfm/shared/errors';
import { backupExportRequestSchema, type BackupTrack } from '@wbfm/shared/backup';
import { BACKUP_MAX_ARCHIVE_BYTES, precheckBackup, restoreBackup } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadForm } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

/** v2.32：可选 tracks 字段（JSON 数组字符串）——前端两步恢复时携带勾选轨道 */
function parseTracks(raw: string | undefined): BackupTrack[] | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw ApiError.validation('恢复轨道参数不是合法 JSON');
  }
  const result = backupExportRequestSchema.safeParse({ tracks: parsed });
  if (!result.success) throw ApiError.validation('恢复轨道参数不合法');
  return result.data.tracks;
}

/** POST /api/backup/restore — 上传 tar.gz 归档，precheck + restore，返回导入统计 */
export const POST = defineRoute(async ({ request, services }) => {
  const { file, fields } = await readUploadForm(request, BACKUP_MAX_ARCHIVE_BYTES);
  const archive = Buffer.from(file.buffer);
  const tracks = parseTracks(fields.tracks);

  // 先 precheck：版本兼容 + 统计条目 + 脱敏警告
  const precheck = await precheckBackup(archive);
  if (!precheck.compatible) {
    throw new ApiError('VALIDATION_ERROR', `备份版本不兼容：${precheck.warnings[0] ?? '请升级应用后再恢复'}`, {
      precheck,
    });
  }

  // 正式恢复
  const deps = { db: services.db, cipher: services.cipher };
  const result = await restoreBackup(deps, archive, tracks ? { tracks } : {});

  // 统一 {success,data} 信封（客户端 request() 依赖 payload.success 判定成败，
  // 裸返回会导致恢复实际成功但前端误报「请求失败」）
  return jsonOk({ precheck, result });
});
