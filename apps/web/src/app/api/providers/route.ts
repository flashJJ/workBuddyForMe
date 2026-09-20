import { providerCreateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  return jsonOk(services.providers.list());
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(providerCreateSchema, await readJsonBody(request));
  return jsonOk(services.providers.create(input), 201);
});
