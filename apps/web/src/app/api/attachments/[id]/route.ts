import { idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * 附件回流：返回原始图片字节。
 * 不走 envelope（直接作为 <img>/object URL 使用）；令牌仍由 defineRoute 统一校验，
 * 因此前端需经带令牌头的 fetch 取 blob，不能直接把 URL 放进 <img src>。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { mimeType, buffer } = services.attachments.read(id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': mimeType,
      'cache-control': 'private, max-age=3600',
    },
  });
});
