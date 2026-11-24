import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema, rollbackRequestSchema } from '@wbfm/shared/schemas';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flow-runs/[id]/rollback：按运行回滚文件。
 * dryRun 默认 true；非 dry-run 且存在冲突未 force 时，先返回 409 与预览，避免部分写入。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  if (!createWorkflowRunRepository(services.db).getRun(id)) {
    throw ApiError.notFound('工作流运行', id);
  }
  const body = parseBody(rollbackRequestSchema, await readJsonBody(request));

  if (!body.dryRun) {
    const preview = services.fileSafety.rollback.rollback({ runId: id, ...body, dryRun: true });
    if (preview.totals.conflict > 0 && !(body.force && body.force.length > 0)) {
      throw new ApiError(
        'FILE_ROLLBACK_CONFLICT',
        `回滚存在 ${preview.totals.conflict} 个冲突，确认后使用 force 重试`,
        preview,
      );
    }
  }

  const result = services.fileSafety.rollback.rollback({ runId: id, ...body });
  services.audit.safeAppend({
    kind: 'file_rollback_applied',
    actor: 'user',
    runId: id,
    reasonCode: 'file_rollback_applied',
    outcome: JSON.stringify({ dryRun: result.dryRun, totals: result.totals }),
  });
  return jsonOk(result);
});
