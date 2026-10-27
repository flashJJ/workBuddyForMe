import { idParamSchema } from '@wbfm/shared/schemas';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams, parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  format: z.enum(['markdown']).default('markdown'),
  locale: z.enum(['zh', 'en']).default('zh'),
});

/** GET /api/meetings/:id/export?format=markdown&locale=zh */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { locale } = parseSearch(querySchema, new URL(request.url));
  const { filename, markdown } = services.meetingClosure.exportMarkdown(id, locale);
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});
