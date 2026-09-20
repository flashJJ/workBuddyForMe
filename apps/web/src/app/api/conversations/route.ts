import { conversationCreateSchema } from '@wbfm/shared';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({ assistantId: z.string().min(1).optional() });

export const GET = defineRoute(({ request, services }) => {
  const { assistantId } = parseSearch(listQuerySchema, new URL(request.url));
  return jsonOk(services.conversations.list(assistantId));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(conversationCreateSchema, await readJsonBody(request));
  return jsonOk(services.conversations.create(input.assistantId, input.title), 201);
});
