import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { ApiError } from '@wbfm/shared/errors';
import { WBFM_PACK_MAX_BYTES } from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mod-packs/import — multipart：file（.wbfm-pack）+ selectedPaths（JSON 字符串数组）。
 * 服务端重新 inspect 后执行导入，预检 fatal / 勾选非法均 422，不信前端预检结果。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw ApiError.validation('仅支持 multipart/form-data 上传');
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw ApiError.validation('缺少上传文件（字段名必须为 file，且不能为空）');
  }
  if (file.size > WBFM_PACK_MAX_BYTES) {
    throw ApiError.validation('文件超过 20MB 上限');
  }

  let selectedPaths: string[] = [];
  const rawPaths = form.get('selectedPaths');
  if (typeof rawPaths === 'string' && rawPaths.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawPaths);
      if (
        !Array.isArray(parsed) ||
        parsed.some((p) => typeof p !== 'string' || p.length === 0 || p.length > 260)
      ) {
        throw new Error('bad');
      }
      selectedPaths = parsed;
    } catch {
      throw ApiError.validation('selectedPaths 必须是非空字符串数组的 JSON');
    }
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = services.modPacks.importPack(buffer, selectedPaths);
  return jsonOk({ result }, 201);
});
