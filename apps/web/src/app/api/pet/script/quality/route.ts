import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/pet/script/quality — v4.1 陪伴质量只读汇总（最近决策 + 门控快照） */
export const GET = defineRoute(({ services }) =>
  jsonOk(createPetScriptServer(services).quality()),
);
