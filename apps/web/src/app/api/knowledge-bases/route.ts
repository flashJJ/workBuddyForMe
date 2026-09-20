import { knowledgeBaseCreateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  return jsonOk(services.knowledgeBases.list());
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(knowledgeBaseCreateSchema, await readJsonBody(request));
  return jsonOk(services.knowledgeBases.create(input), 201);
});
