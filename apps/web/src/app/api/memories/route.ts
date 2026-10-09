import { memoryCreateSchema, memoryListQuerySchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 记忆库管理：列表（类别/状态过滤 + 内容搜索）与手工新建（同步写向量） */
export const GET = defineRoute(({ request, services }) => {
  const filter = parseSearch(memoryListQuerySchema, new URL(request.url));
  return jsonOk(services.memories.list(filter));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(memoryCreateSchema, await readJsonBody(request));
  const memory = await services.memories.createManual({
    kind: input.kind,
    content: input.content,
    importance: input.importance,
  });
  return jsonOk(memory, 201);
});
