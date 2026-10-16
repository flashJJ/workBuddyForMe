import { defineRoute } from '@/lib/server/with-api-handler';
import { readJsonBody, parseBody } from '@/lib/server/validation';
import { WBFM_PACK_MIME, packExportRequestSchema } from '@wbfm/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 5987：中文文件名 filename*=UTF-8'' + ASCII 回退名 */
function contentDisposition(filename: string): string {
  const ascii =
    Array.from(filename, (ch) => (ch.charCodeAt(0) < 127 ? ch : '_')).join('') || 'pack';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** POST /api/mod-packs/export — JSON 勾选清单 → application/x-wbfm-pack 二进制下载 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(packExportRequestSchema, await readJsonBody(request));
  const { archive, filename } = services.modPacks.exportPack(input);
  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': WBFM_PACK_MIME,
      'content-disposition': contentDisposition(filename),
      'content-length': String(archive.byteLength),
    },
  });
});
