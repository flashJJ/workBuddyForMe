import { mcpServerCreateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  return jsonOk(services.mcp.getServerInfos());
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(mcpServerCreateSchema, await readJsonBody(request));
  return jsonOk(services.mcp.createServer(input), 201);
});
