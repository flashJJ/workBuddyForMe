import { ApiError } from '@wbfm/shared/errors';
import { BRANCH_TERMINAL_STATUSES } from '@wbfm/shared/types';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.22：重试 = 以失败/中断分支为来源新建分支；旧分支保持终态可追溯 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const source = services.branches.get(id);
  if (!(BRANCH_TERMINAL_STATUSES as readonly string[]).includes(source.status)) {
    throw ApiError.validation(`分支尚未结束，不能重试：${source.status}`);
  }
  const { branch, childConversationId } = services.branches.create(source.parentConversationId, {
    goal: source.goal,
    title: source.title,
    autoStart: true,
  });
  return jsonOk(
    {
      branch,
      conversation: services.conversations.get(childConversationId),
      childConversationId,
      retriedFrom: source.id,
    },
    201,
  );
});
