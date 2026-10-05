import { formatSse, type FlowEventPayload, type WorkflowRunView } from '@wbfm/shared';
import type { WorkflowRunRepository } from '@wbfm/database';
import type { FlowRunService } from '@wbfm/core';

/**
 * v0.9 工作流运行事件 SSE（内部路由与公开只读路由共用）：
 * - 非 queued 且本进程无执行者：从 node_executions 一次性回放 + 收尾事件后关闭；
 * - 其余（queued/进行中）：只读订阅 EventBus，先补缓冲再接实时，断开不影响执行。
 */
const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

export function flowRunEventsResponse(options: {
  request: Request;
  run: WorkflowRunView;
  runs: WorkflowRunRepository;
  flowRunner: FlowRunService;
  /** 公开只读订阅：跳过前 N 个事件（?after=N 断线补丢）；内部订阅不传 */
  afterSeq?: number;
}): Response {
  const { request, run, runs, flowRunner, afterSeq } = options;
  const skip = Number.isFinite(afterSeq) && (afterSeq as number) >= 0 ? (afterSeq as number) : 0;
  let delivered = 0;
  const encoder = new TextEncoder();
  const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: string) => {
    delivered += 1;
    if (delivered <= skip) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      /* 流已取消 */
    }
  };

  if (run.status !== 'queued' && !flowRunner.isActive(run.id)) {
    const nodes = runs.listNodeExecutions(run.id);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        try {
          for (const node of nodes) {
            const payload: FlowEventPayload =
              node.status === 'skipped'
                ? {
                    type: 'node_skipped',
                    runId: run.id,
                    workflowId: run.workflowId,
                    nodeId: node.nodeId,
                    reason: '分支未命中',
                  }
                : {
                    type: 'node_succeeded',
                    runId: run.id,
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
                runId: run.id,
                workflowId: run.workflowId,
                output: run.output,
              }),
            );
          } else if (run.status === 'failed') {
            enqueue(
              controller,
              formatSse('flow', {
                type: 'run_failed',
                runId: run.id,
                workflowId: run.workflowId,
                message: run.error?.message ?? '运行失败',
                ...(run.error?.nodeId ? { nodeId: run.error.nodeId } : {}),
              }),
            );
          } else if (run.status === 'interrupted') {
            enqueue(
              controller,
              formatSse('flow', {
                type: 'run_failed',
                runId: run.id,
                workflowId: run.workflowId,
                message:
                  run.interruptReason === 'process_restart'
                    ? '服务重启导致运行中断，可从运行记录重跑'
                    : '运行中断',
              }),
            );
          } else {
            enqueue(
              controller,
              formatSse('flow', {
                type: 'run_cancelled',
                runId: run.id,
                workflowId: run.workflowId,
              }),
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

  const subscription = flowRunner.subscribeRunEvents(run.id, request.signal);
  if (!subscription) {
    return new Response('运行不存在', { status: 404 });
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of subscription) {
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
}
