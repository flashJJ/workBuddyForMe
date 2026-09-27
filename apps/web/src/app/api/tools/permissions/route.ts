import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ request, services }) => {
  const url = new URL(request.url);
  const toolName = url.searchParams.get('toolName') || undefined;
  return jsonOk(services.permissions.listPermissions(toolName));
});
