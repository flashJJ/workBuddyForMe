import { ApiError } from '@wbfm/shared/errors';
import { flowRunBatchReplaySchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flow-runs/replay-batch：多选失败运行批量重放（≤20，部分失败不阻断） */
export const POST = defineRoute(async ({ request, services }) => {
  if (!services.flowReliability) {
    throw ApiError.validation('运行兜底服务未启用');
  }
  const body = parseBody(flowRunBatchReplaySchema, await readJsonBody(request));
  const result = services.flowReliability.replay.replayBatch({
    runIds: body.runIds,
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.nodeMode ? { nodeMode: body.nodeMode } : {}),
  });
  return jsonOk(result);
});
