import {
  PET_SCRIPT_DECISION_LIMITS,
  petScriptDecisionReportSchema,
  type PetScriptDecisionView,
} from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/pet/script/decisions — 最近实际开演的主动播放决策 */
export const GET = defineRoute(({ request, services }) => {
  const raw = new URL(request.url).searchParams.get('limit');
  const parsed = raw ? Number(raw) : PET_SCRIPT_DECISION_LIMITS.visible;
  const limit = Number.isFinite(parsed) ? parsed : PET_SCRIPT_DECISION_LIMITS.visible;
  const view: PetScriptDecisionView = {
    decisions: createPetScriptServer(services).decisions.list(limit),
  };
  return jsonOk(view);
});

/** POST /api/pet/script/decisions — 桌宠开演后上报（at/title 由服务端补） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptDecisionReportSchema, await readJsonBody(request));
  return jsonOk(createPetScriptServer(services).decisions.record(input));
});
