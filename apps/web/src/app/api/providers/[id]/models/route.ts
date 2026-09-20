import { idParamSchema, modelCapabilitySchema, modelCreateSchema } from '@wbfm/shared';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const modelsQuerySchema = z.object({
  capability: modelCapabilitySchema.optional(),
  remote: z.enum(['1', '0']).optional(),
});

export const GET = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const query = parseSearch(modelsQuerySchema, new URL(request.url));
  if (query.remote === '1') {
    const remote = await services.models.fetchRemoteList(id, request.signal);
    return jsonOk(remote);
  }
  const models = query.capability
    ? services.models.listByCapability(query.capability)
    : services.models.listByProvider(id);
  return jsonOk(models);
});

export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(modelCreateSchema, await readJsonBody(request));
  return jsonOk(services.models.add(id, input), 201);
});
