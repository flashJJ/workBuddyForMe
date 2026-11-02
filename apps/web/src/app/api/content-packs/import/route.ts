import { contentPackImportSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v2.18 M4：导入内容包。
 * 同步完成下载与 SHA-256 校验后建库；34 篇文档注册为 pending，
 * 随后由服务端后台逐个摄入，客户端复用文档状态轮询。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const body = parseBody(contentPackImportSchema, await readJsonBody(request));
  return jsonOk(await services.contentPacks.importPack(body.id), 201);
});
