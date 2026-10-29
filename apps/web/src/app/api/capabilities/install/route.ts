import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

const MAX_PACK_BYTES = 20 * 1024 * 1024;

/** v2.10：multipart ZIP 安装（校验通过后自动启用） */
export const POST = defineRoute(async ({ request, services }) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw ApiError.validation('缺少 file（能力包 ZIP）');
  if (file.size === 0) throw ApiError.validation('能力包为空');
  if (file.size > MAX_PACK_BYTES) throw ApiError.validation('能力包超过 20MB 上限');
  const buffer = new Uint8Array(await file.arrayBuffer());
  return jsonOk(services.capabilities.install(buffer), 201);
});
