import { formatSse, idParamSchema, type FlowEventPayload } from '@wbfm/shared';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

/**
 * GET /api/flows/runs/:id/events：订阅工作流运行事件（queued → 启动执行）。
 * 运行生命周期 = SSE 连接生命周期；断线联动 abort（人工挂起按拒绝处理）。
 * 已终态运行：从 node_executions 回放节点时间线。
 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) {
    return new Response('Not Found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: string) => {
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      /* 流已取消 */
    }
  };

  // 终态：回放节点执行记录，补 run 收尾事件后关闭
  if (run.status !== 'queued' && !services.flowRunner.isActive(id)) {
    const nodes = repo.listNodeExecutions(id);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        try {
          for (const node of nodes) {
            const payload: FlowEventPayload =
              node.status === 'skipped'
                ? { type: 'node_skipped', runId: id, workflowId: run.workflowId, nodeId: node.nodeId, reason: '分支未命中' }
                : {
                    type: 'node_succeeded',
                    runId: id,
                    workflowId: run.workflowId,
                    nodeId: node.nodeId,
                    ...(node.outputs !== null ? { outputs: node.outputs } : {}),
                  };
            enqueue(controller, formatSse('flow', payload));
          }
          if (run.status === 'succeeded') {
            enqueue(
              controller,
              formatSse('flow', {
                type: 'run_succeeded',
                runId: id,
                workflowId: run.workflowId,
                output: run.output,
              }),
            );
          } else if (run.status === 'failed') {
            enqueue(
              controller,
              formatSse('flow', {
                type: 'run_failed',
                runId: id,
                workflowId: run.workflowId,
                message: run.error?.message ?? '运行失败',
                ...(run.error?.nodeId ? { nodeId: run.error.nodeId } : {}),
              }),
            );
          } else {
            enqueue(
              controller,
              formatSse('flow', { type: 'run_cancelled', runId: id, workflowId: run.workflowId }),
            );
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  // queued：启动执行，逐事件转发；事件为裸 FlowEventPayload，统一包到 flow 事件名下
  const started = services.flowRunner.startEvents(id, request.signal);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of started.events) {
          enqueue(controller, formatSse('flow', event));
        }
      } catch {
        enqueue(
          controller,
          formatSse('error', { code: 'INTERNAL_ERROR', message: '工作流事件流中断' }),
        );
      } finally {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
});
