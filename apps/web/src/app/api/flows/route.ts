import { workflowCreateSchema, type WorkflowCreateInput } from '@wbfm/shared';
import { createWorkflowRepository, createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows：工作流列表（附带最近一次完成运行时间） */
export const GET = defineRoute(({ services }) => {
  const workflows = createWorkflowRepository(services.db);
  const runs = createWorkflowRunRepository(services.db);
  return jsonOk(
    workflows.listWorkflows().map((wf) => ({
      ...wf,
      lastRunAt: runs.getLatestFinishedAt(wf.id),
    })),
  );
});

/** POST /api/flows：新建草稿工作流 */
export const POST = defineRoute(async ({ request, services }) => {
  const body = parseBody(
    workflowCreateSchema,
    await readJsonBody(request),
  ) as WorkflowCreateInput;
  const wf = createWorkflowRepository(services.db).createWorkflow(body);
  return jsonOk(wf, 201);
});
