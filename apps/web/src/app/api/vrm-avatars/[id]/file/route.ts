import { defineRoute } from '@/lib/server/with-api-handler';
import { ApiError } from '@wbfm/shared/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

/** GET /api/vrm-avatars/:id/file — VRM 文件流（供 three.js GLTFLoader 加载） */
export const GET = defineRoute<Params>(({ services, params }) => {
  // 兼容两种入参：数据库 id 或 fileRef（vrm-canvas 按 fileRef 加载）
  const avatar = services.vrmAvatars.get(params.id) ?? services.vrmAvatars.getByFileRef(params.id);
  if (!avatar) throw ApiError.notFound('VRM 形象', params.id);
  const { buffer } = services.vrmAvatars.readFile(avatar.fileRef);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(buffer.byteLength),
      'cache-control': 'private, max-age=3600',
    },
  });
});
