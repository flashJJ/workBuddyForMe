import { z } from 'zod';
import { workPlanStepUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1), stepId: z.string().min(1) });

/** v2.8：更新计划步骤状态 / 备注（只前进，不回退） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id, stepId } = parseParams(paramsSchema, params);
  const input = parseBody(workPlanStepUpdateSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.updateStep(id, stepId, input));
});
