import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';
import { ApiError } from '@wbfm/shared/errors';
import { VRM_MAX_BYTES } from '@wbfm/shared/constants';
import type { VrmAvatarListResponse, VrmAvatarUploadResponse } from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/vrm-avatars — 已导入 VRM 列表 */
export const GET = defineRoute(({ services }) => {
  return jsonOk<VrmAvatarListResponse>({ avatars: services.vrmAvatars.list() });
});

/** POST /api/vrm-avatars — 上传导入 VRM（multipart） */
export const POST = defineRoute(async ({ request, services }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw ApiError.validation('仅支持 multipart/form-data 上传');
  }
  const file = await readUploadPart(request, VRM_MAX_BYTES);
  const avatar = services.vrmAvatars.importAvatar({
    filename: file.filename,
    buffer: file.buffer,
  });
  return jsonOk<VrmAvatarUploadResponse>({ avatar }, 201);
});
