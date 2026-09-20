import { chatRequestSchema } from '@wbfm/shared';
import { createRagRetriever } from '@wbfm/core';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { sseResponse } from '@/lib/server/sse-stream';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(chatRequestSchema, await readJsonBody(request));
  // 在打开 SSE 前完成存在性校验，使 404/422 走统一 JSON 错误
  services.assistants.get(input.assistantId);

  const retriever = createRagRetriever({ db: services.db, cipher: services.cipher });
  const events = services.orchestrator.streamChat({
    ...input,
    signal: request.signal,
    retrieve: retriever,
  });
  return sseResponse(events);
});
