import { createTaskRunRepository } from '@wbfm/database';
import { ApiError, formatSse, idParamSchema, type TaskEventPayload, type TaskRunView, type TaskStepView } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { sseResponse } from '@/lib/server/sse-stream';
import { parseParams } from '@/lib/server/validation';
import { resolveTaskLaunchArtifacts } from '@/lib/server/task-launcher';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tasks/:id/events：SSE 任务事件流。
 * - queued：解析 launch 依赖后启动循环（循环生命周期 = 本请求生命周期；断线联动 abort）
 * - running/paused：409（已有订阅；前端应只开一个 EventSource）
 * - 终态（completed/failed/stopped）：回放已落库步骤 + run_finished 后关闭
 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createTaskRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) throw ApiError.notFound('任务', id);

  if (services.taskRunner.isActive(id)) {
    throw ApiError.conflict('任务事件流已被订阅，请勿重复打开');
  }

  // 终态：回放历史步骤后关闭（前端刷新页面用）
  if (run.status !== 'queued') {
    return replayTerminalRun(run, repo.listSteps(id));
  }

  // queued：解析 launch 依赖（assistant/model/vision），失败抛 422
  const { planner, allowedTools, visionCapable } = resolveTaskLaunchArtifacts(services, run);
  const events = services.taskRunner.start({
    run,
    planner,
    allowedTools,
    visionCapable,
    clientSignal: request.signal,
  });
  return sseResponse(events);
});

/** 终态运行回放：把每步包成 step_finished 事件，最后追加 run_finished */
function replayTerminalRun(run: TaskRunView, steps: TaskStepView[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* 流已取消 */
        }
      };
      try {
        for (const step of steps) {
          const payload: TaskEventPayload = {
            type: 'step_finished',
            runId: run.id,
            conversationId: run.conversationId,
            step,
          };
          safeEnqueue(encoder.encode(formatSse('task', payload)));
        }
        const finishPayload: TaskEventPayload = {
          type: 'run_finished',
          runId: run.id,
          conversationId: run.conversationId,
          run,
        };
        safeEnqueue(encoder.encode(formatSse('task', finishPayload)));
      } finally {
        try {
          controller.close();
        } catch {
          /* 流已取消或已关闭 */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
