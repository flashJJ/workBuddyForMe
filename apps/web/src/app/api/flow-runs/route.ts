import { z } from 'zod';
import {
  FLOW_RUN_RESUMABLE_STATUSES,
  FLOW_RUN_STATUSES,
  FLOW_TRIGGERS,
  type FlowRunStatus,
  type FlowTrigger,
} from '@wbfm/shared';
import {
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

const listSchema = z.object({
  trigger: z.enum(FLOW_TRIGGERS).optional(),
  status: z.enum(FLOW_RUN_STATUSES).optional(),
  workflowId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/flow-runs：运行记录中心（v0.9 M4）。
 * 支持 trigger/status/workflowId 过滤；附带工作流名与「可从失败节点重放」的节点候选。
 */
export const GET = defineRoute(({ request, services }) => {
  const url = new URL(request.url);
  const filter = listSchema.parse({
    trigger: url.searchParams.get('trigger') || undefined,
    status: url.searchParams.get('status') || undefined,
    workflowId: url.searchParams.get('workflowId') || undefined,
    limit: url.searchParams.get('limit') || undefined,
  });

  const repo = createWorkflowRunRepository(services.db);
  const workflows = createWorkflowRepository(services.db);
  const runs = repo.listRuns({
    trigger: filter.trigger as FlowTrigger | undefined,
    status: filter.status as FlowRunStatus | undefined,
    limit: filter.limit,
  });
  const filtered = filter.workflowId
    ? runs.filter((run) => run.workflowId === filter.workflowId)
    : runs;

  const items = filtered.map((run) => {
    const wf = workflows.getWorkflow(run.workflowId);
    // 失败/中断运行给出可重放的节点（失败节点优先；无失败记录时不暴露节点重放）
    let replayNodeId: string | null = null;
    if (FLOW_RUN_RESUMABLE_STATUSES.includes(run.status)) {
      const failed = repo
        .listNodeExecutions(run.id)
        .find((node) => node.status === 'failed');
      replayNodeId = failed?.nodeId ?? null;
    }
    return {
      runId: run.id,
      workflowId: run.workflowId,
      workflowName: wf?.name ?? '(已删除流程)',
      status: run.status,
      trigger: run.trigger,
      version: run.version,
      parentRunId: run.parentRunId,
      resumedFromNode: run.resumedFromNode,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      replayNodeId,
      ...(run.error ? { error: run.error } : {}),
    };
  });

  return jsonOk({ runs: items });
});
