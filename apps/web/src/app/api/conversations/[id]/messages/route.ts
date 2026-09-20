import { idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const limitParam = new URL(request.url).searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  return jsonOk(services.conversations.listMessages(id, limit));
});
