import { createPropContentService } from '@wbfm/core/services';
import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/prop-assets?pack=&file= — 道具包 GLB 文件流（供 GLTFLoader 加载） */
export const GET = defineRoute(({ request, services }) => {
  const url = new URL(request.url);
  const pack = url.searchParams.get('pack')?.trim();
  const file = url.searchParams.get('file')?.trim();
  if (!pack || !file) throw ApiError.validation('缺少道具资源参数');

  const { buffer, contentType } = createPropContentService({ db: services.db }).readAsset(
    pack,
    file,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': contentType,
      'content-length': String(buffer.byteLength),
      'cache-control': 'private, max-age=3600',
    },
  });
});
