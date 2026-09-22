import { z } from 'zod';
import { idParamSchema } from '@wbfm/shared';
import { buildConversationSnapshot } from '@wbfm/core';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams, parseSearch } from '@/lib/server/validation';
import { renderConversationHtml } from '@/lib/share/html-template';
import { serializeMarkdown } from '@/lib/share/markdown-serializer';

export const dynamic = 'force-dynamic';

const exportQuerySchema = z.object({
  format: z.enum(['html', 'markdown']),
});

/** 标题 → 跨平台安全文件名片段（兜底 conversation） */
function safeName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60)
    .replace(/^_+|_+$/g, '');
  return cleaned || 'conversation';
}

/**
 * 构造 Content-Disposition。HTTP 头为 Latin-1 ByteString，中文文件名必须走
 * RFC 5987：ASCII 回退名 + filename*=UTF-8''<percent-encoded>
 */
function contentDisposition(name: string, ext: string): string {
  const asciiName =
    Array.from(name, (ch) => (ch.charCodeAt(0) < 127 ? ch : '_')).join('') || 'conversation';
  return `attachment; filename="${asciiName}.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}.${ext}`;
}

/** GET /api/conversations/:id/export?format=html|markdown — 分享文件下载（已脱敏） */
export const GET = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { format } = parseSearch(exportQuerySchema, new URL(request.url));

  const snapshot = await buildConversationSnapshot(
    { db: services.db, cipher: services.cipher },
    id,
  );

  const name = safeName(snapshot.title);
  if (format === 'html') {
    return new Response(renderConversationHtml(snapshot), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': contentDisposition(name, 'html'),
      },
    });
  }

  return new Response(serializeMarkdown(snapshot), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': contentDisposition(name, 'md'),
    },
  });
});
