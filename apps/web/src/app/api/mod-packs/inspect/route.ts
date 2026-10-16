import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';
import { WBFM_PACK_MAX_BYTES } from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mod-packs/inspect — 上传 .wbfm-pack 做预检（不落盘、不写库）。
 * 返回 PackPreview：fatal 非空表示整包拒绝；entries 逐条带 valid/conflict/errors。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const file = await readUploadPart(request, WBFM_PACK_MAX_BYTES);
  const preview = services.modPacks.inspect(file.buffer);
  return jsonOk({ preview });
});
