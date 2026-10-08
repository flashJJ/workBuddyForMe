import { ApiError } from '@wbfm/shared/errors';
import { toolConfirmSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(toolConfirmSchema, await readJsonBody(request));

  // 1. 先 resolve 挂起项（返回 false 说明 callId 不存在或已超时）
  const ok = services.confirmations.resolve(input.callId, input.action);
  if (!ok) {
    throw ApiError.notFound('确认请求', input.callId);
  }

  // 2. allow + remember 时写入授权记忆
  if (input.action === 'allow' && input.remember) {
    if (input.remember === 'task') {
      // v0.7 M2：任务级批量授权（仅内存，进程重启即失效）
      services.taskGrants.grant(input.tool, input.taskScope!);
    } else {
      const scope = input.remember === 'all' ? 'all' : `assistant:${input.assistantId}`;
      services.permissions.grantPermission(input.tool, scope, 'allow');
    }
  }

  return jsonOk({ ok: true });
});
