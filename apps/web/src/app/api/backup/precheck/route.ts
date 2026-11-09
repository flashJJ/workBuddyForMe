import { BACKUP_MAX_ARCHIVE_BYTES, precheckBackup } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backup/precheck — v2.32：只读预检。
 * 上传 tar.gz 归档后只解析 manifest 与轨道文件，不写库、不落盘解压目录。
 */
export const POST = defineRoute(async ({ request }) => {
  const upload = await readUploadPart(request, BACKUP_MAX_ARCHIVE_BYTES);
  const precheck = await precheckBackup(Buffer.from(upload.buffer));
  return jsonOk(precheck);
});
