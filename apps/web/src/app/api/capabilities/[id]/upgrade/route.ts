import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const MAX_PACK_BYTES = 20 * 1024 * 1024;

/**
 * v2.12 M2：同 id 原地升级（multipart ZIP；预检通过后原子换目录，失败回滚）。
 * v2.14：multipart 可选 confirmDowngrade='true' + expectedVersion（降级）、repair='true'（同版本修复）。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw ApiError.validation('缺少 file（能力包 ZIP）');
  if (file.size === 0) throw ApiError.validation('能力包为空');
  if (file.size > MAX_PACK_BYTES) throw ApiError.validation('能力包超过 20MB 上限');
  const buffer = new Uint8Array(await file.arrayBuffer());
  const expectedVersion = form.get('expectedVersion');
  return jsonOk(
    services.capabilities.upgrade(id, buffer, {
      confirmDowngrade: form.get('confirmDowngrade') === 'true',
      expectedVersion: typeof expectedVersion === 'string' ? expectedVersion : undefined,
      repair: form.get('repair') === 'true',
    }),
  );
});
