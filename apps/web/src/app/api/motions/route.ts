import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';
import { ApiError } from '@wbfm/shared/errors';
import { MOTION_MAX_BYTES } from '@wbfm/shared/constants';
import { createSettingsRepository } from '@wbfm/database';
import { readVoiceSettings } from '@/lib/server/voice/voice-settings';
import type { MotionAssetListResponse, MotionAssetUploadResponse } from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/motions — 已导入待机动作列表 + 当前选中的 idleMotionId */
export const GET = defineRoute(({ services }) => {
  const selectedId = readVoiceSettings(createSettingsRepository(services.db)).idleMotionId;
  return jsonOk<MotionAssetListResponse>({ motions: services.motions.list(), selectedId });
});

/** POST /api/motions — 上传导入 VRMA 待机动作（multipart） */
export const POST = defineRoute(async ({ request, services }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw ApiError.validation('仅支持 multipart/form-data 上传');
  }
  const file = await readUploadPart(request, MOTION_MAX_BYTES);
  const motion = services.motions.importMotion({
    filename: file.filename,
    buffer: file.buffer,
  });
  return jsonOk<MotionAssetUploadResponse>({ motion }, 201);
});
