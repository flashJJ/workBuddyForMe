import { idParamSchema, stageSceneUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.stageScenes.get(id));
});

export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(stageSceneUpdateSchema, await readJsonBody(request));
  return jsonOk(services.stageScenes.update(id, input));
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.stageScenes.delete(id);
  return jsonOk({ id });
});
