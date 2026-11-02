import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

function contentType(mime: string): string {
  return mime === 'image/svg+xml' ? mime : `${mime}; charset=utf-8`;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** v2.18：产物预览/下载；只允许 html/svg/md 三种 MIME，CSP 禁止脚本与外联 */
export const GET = defineRoute(({ params, request, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { filename, mimeType, buffer } = services.attachments.readArtifact(id);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': contentType(mimeType),
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=3600',
      ...(download ? { 'content-disposition': contentDisposition(filename) } : {}),
    },
  });
});
