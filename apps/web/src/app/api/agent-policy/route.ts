import { agentPolicySchema } from '@wbfm/shared/schemas';
import { agentPolicyHash } from '@wbfm/core/governance';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/agent-policy：当前策略与哈希（v2.13 M2） */
export const GET = defineRoute(({ services }) => {
  const policy = services.settings.get().agentPolicy!;
  return jsonOk({ policy, hash: agentPolicyHash(policy) });
});

/** PUT /api/agent-policy：整份保存（Zod 校验；策略变更审计在 M3） */
export const PUT = defineRoute(async ({ request, services }) => {
  const policy = parseBody(agentPolicySchema, await readJsonBody(request));
  const settings = services.settings.update({ agentPolicy: policy });
  const saved = settings.agentPolicy!;
  return jsonOk({ policy: saved, hash: agentPolicyHash(saved) });
});
