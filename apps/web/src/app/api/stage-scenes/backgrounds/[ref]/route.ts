import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const fileRefParamSchema = z.object({ ref: z.string().trim().min(1).max(120) });

/**
 * 背景文件回流：直接返回图片字节（同附件模式，令牌由 defineRoute 统一校验）。
 * fileRef 在服务层做严格白名单校验（防路径穿越）。
 */
export const GET = defineRoute(({ params, services }) => {
  const { ref } = parseParams(fileRefParamSchema, params);
  const { mimeType, buffer } = services.stageScenes.readBackground(ref);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': mimeType,
      'cache-control': 'private, max-age=3600',
    },
  });
});
