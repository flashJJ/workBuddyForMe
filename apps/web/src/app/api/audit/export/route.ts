import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';

/** GET /api/audit/export?format=jsonl：流式导出完整账本（升序，不提供删除） */
export const GET = defineRoute(({ request, services }) => {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('format') !== 'jsonl') {
    throw ApiError.validation('仅支持 format=jsonl');
  }
  const encoder = new TextEncoder();
  const iterator = services.audit.iterateJsonl();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next.value));
    },
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="audit-${stamp}.jsonl"`,
      'cache-control': 'no-store',
    },
  });
});
