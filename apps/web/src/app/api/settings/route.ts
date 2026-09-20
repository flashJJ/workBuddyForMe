import { settingsUpdateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  return jsonOk(services.settings.get());
});

export const PUT = defineRoute(async ({ request, services }) => {
  const input = parseBody(settingsUpdateSchema, await readJsonBody(request));
  return jsonOk(services.settings.update(input));
});
