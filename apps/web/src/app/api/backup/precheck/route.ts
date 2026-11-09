import { backupPasswordSchema } from '@wbfm/shared/backup';
import { ApiError } from '@wbfm/shared/errors';
import { BACKUP_MAX_ARCHIVE_BYTES, precheckBackup } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadForm } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

/** v2.33：归档密码由 multipart 文本字段传输；空值视为未提供 */
function parsePassword(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const result = backupPasswordSchema.safeParse(raw);
  if (!result.success) throw ApiError.validation('归档密码需为 8–128 个字符');
  return result.data;
}

/**
 * POST /api/backup/precheck — v2.32：只读预检。
 * 上传 tar.gz 归档后只解析 manifest 与轨道文件，不写库、不落盘解压目录。
 * v2.33：加密归档需附带 password 字段。
 */
export const POST = defineRoute(async ({ request }) => {
  const { file, fields } = await readUploadForm(request, BACKUP_MAX_ARCHIVE_BYTES);
  const password = parsePassword(fields.password);
  const precheck = await precheckBackup(Buffer.from(file.buffer), { password });
  return jsonOk(precheck);
});
