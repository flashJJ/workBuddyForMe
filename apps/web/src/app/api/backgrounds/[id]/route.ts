import fs from 'node:fs';
import path from 'node:path';
import { getDataRoot } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import { backgroundFileKind, isBackgroundFileId } from '@wbfm/shared/background';
import { defineRoute } from '@/lib/server/with-api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
};

/**
 * GET /api/backgrounds/[id] — 读取桌面端已复制的背景文件。
 * id 只允许 uuid + 白名单扩展名；目录固定为 <dataRoot>/backgrounds。
 */
export const GET = defineRoute<{ id: string }>(({ params }) => {
  const id = params.id ?? '';
  if (!isBackgroundFileId(id) || !backgroundFileKind(id)) {
    throw ApiError.validation('背景 id 不合法');
  }

  const ext = id.slice(id.lastIndexOf('.') + 1).toLowerCase();
  const filePath = path.join(getDataRoot(), 'backgrounds', id);
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    throw ApiError.notFound('背景文件', id);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'content-length': String(buffer.byteLength),
      'cache-control': 'private, max-age=86400, immutable',
    },
  });
});
