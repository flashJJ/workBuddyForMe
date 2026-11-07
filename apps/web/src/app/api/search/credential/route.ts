import { z } from 'zod';
import { SEARCH_KEY_PROVIDERS } from '@wbfm/shared/constants';
import { searchCredentialSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ provider: z.enum(SEARCH_KEY_PROVIDERS) });

/** v2.24：搜索服务密钥状态（只返回脱敏串，不返回明文） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.search.getCredentials());
});

export const PUT = defineRoute(async ({ request, services }) => {
  const input = parseBody(searchCredentialSchema, await readJsonBody(request));
  services.search.setCredential(input.provider, input.apiKey);
  return jsonOk(services.search.getCredentials());
});

export const DELETE = defineRoute(({ request, services }) => {
  const { provider } = parseSearch(querySchema, new URL(request.url));
  services.search.clearCredential(provider);
  return jsonOk(services.search.getCredentials());
});
