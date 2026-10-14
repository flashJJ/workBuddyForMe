import { stageSceneCreateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  return jsonOk(services.stageScenes.list());
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(stageSceneCreateSchema, await readJsonBody(request));
  return jsonOk(services.stageScenes.create(input), 201);
});
