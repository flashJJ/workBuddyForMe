import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadForm } from '@/lib/server/multipart';
import { ApiError } from '@wbfm/shared/errors';
import { MOTION_MAX_BYTES } from '@wbfm/shared/constants';
import { createSettingsRepository } from '@wbfm/database';
import { readVoiceSettings } from '@/lib/server/voice/voice-settings';
import {
  MOTION_ENTRY_KEY_MAX,
  MOTION_MOODS,
  MOTION_SEGMENTS,
  relationshipLevelSchema,
  type MotionAssetListResponse,
  type MotionAssetUploadResponse,
} from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/motions — 已导入待机动作列表 + 当前选中的 idleMotionId */
export const GET = defineRoute(({ services }) => {
  const selectedId = readVoiceSettings(createSettingsRepository(services.db)).idleMotionId;
  return jsonOk<MotionAssetListResponse>({ motions: services.motions.list(), selectedId });
});

/** 可选标注字段的取值校验（缺省/空串 → undefined，交由 motion-service 填缺省） */
function pickEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw ApiError.validation(`${field} 取值非法：${value}`);
  }
  return value as T;
}

function pickLevel(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  const parsed = relationshipLevelSchema.safeParse(Number(value));
  if (!parsed.success) throw ApiError.validation('关系门槛必须是 0–3 的整数');
  return parsed.data;
}

function pickText(raw: string | undefined, max: number, field: string): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.length > max) throw ApiError.validation(`${field} 超过 ${max} 字符上限`);
  return value;
}

/**
 * POST /api/motions — 上传导入 VRMA 待机动作（multipart）
 *
 * v2.2：除 file 外接受可选标注字段 name / segment / mood / entryKey / minRelationshipLevel，
 * 缺省由 motion-service 填（single / normal / 自成条目 / 无门槛）。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw ApiError.validation('仅支持 multipart/form-data 上传');
  }
  const { file, fields } = await readUploadForm(request, MOTION_MAX_BYTES);
  const motion = services.motions.importMotion({
    filename: file.filename,
    buffer: file.buffer,
    name: pickText(fields.name, 80, '名称'),
    segment: pickEnum(fields.segment, MOTION_SEGMENTS, '动作段'),
    mood: pickEnum(fields.mood, MOTION_MOODS, '心情档位'),
    entryKey: pickText(fields.entryKey, MOTION_ENTRY_KEY_MAX, '动作条目键'),
    minRelationshipLevel: pickLevel(fields.minRelationshipLevel),
  });
  return jsonOk<MotionAssetUploadResponse>({ motion }, 201);
});
