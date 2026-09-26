import { ApiError, memoryUpdateSchema, idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const memory = services.memories.get(id);
  if (!memory) throw ApiError.notFound('记忆', id);
  return jsonOk(memory);
});

export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(memoryUpdateSchema, await readJsonBody(request));
  const memory = await services.memories.update(id, input);
  if (!memory) throw ApiError.notFound('记忆', id);
  return jsonOk(memory);
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  if (!services.memories.remove(id)) throw ApiError.notFound('记忆', id);
  return jsonOk({ id, deleted: true });
});
