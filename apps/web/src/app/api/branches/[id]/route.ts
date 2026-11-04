import { branchUpdateSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const branch = services.branches.get(id);
  return jsonOk({
    branch,
    childConversation: services.conversations.get(branch.childConversationId),
    evidence: branch.evidence,
  });
});

export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(branchUpdateSchema, await readJsonBody(request));
  return jsonOk({ branch: services.branches.rename(id, input.title) });
});

/** 只删分支关联；子会话保留为普通会话；运行中先停止并等待终态 */
export const DELETE = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.branches.remove(id));
});
