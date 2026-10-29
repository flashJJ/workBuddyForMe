import { z } from 'zod';
import { CAPABILITY_KINDS, type CapabilityKind } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  kind: z.enum(CAPABILITY_KINDS).default('skill'),
});

/** v2.11：按 kind 下载示例能力包（缺省 skill，保持旧链接可用） */
export const GET = defineRoute(({ request, services }) => {
  const parsed = querySchema.safeParse({
    kind: new URL(request.url).searchParams.get('kind') ?? undefined,
  });
  if (!parsed.success) throw ApiError.validation('kind 不合法');
  const kind: CapabilityKind = parsed.data.kind;
  return new Response(services.capabilities.sample(kind) as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="capability-sample-${kind}.zip"`,
      'cache-control': 'no-store',
    },
  });
});
