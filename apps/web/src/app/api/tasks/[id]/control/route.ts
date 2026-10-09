import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const controlSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop']),
});

/**
 * POST /api/tasks/:id/control { action }：暂停 / 继续 / 终止单个任务。
 * 不存在的运行或非活跃运行返回 404（control 仅作用于活跃运行）。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(controlSchema, await readJsonBody(request));
  if (!services.taskRunner.isActive(id)) {
    throw ApiError.notFound('活跃任务', id);
  }
  const ok = (() => {
    if (input.action === 'pause') return services.taskRunner.pause(id);
    if (input.action === 'resume') return services.taskRunner.resume(id);
    return services.taskRunner.stop(id);
  })();
  if (!ok) throw ApiError.conflict('任务状态切换失败（可能刚结束）');
  return jsonOk({ id, action: input.action, ok: true });
});
