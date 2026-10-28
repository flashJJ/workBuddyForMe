import { createTaskRunRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { formatSse } from '@wbfm/shared/api';
import {
  idParamSchema,
  type TaskEventPayload,
  type TaskRunView,
  type TaskStepView,
} from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { sseResponse } from '@/lib/server/sse-stream';
import { parseParams } from '@/lib/server/validation';
import { resolveTaskLaunchArtifacts } from '@/lib/server/task-launcher';
import { convergeOrphanTaskRun } from '@wbfm/core/services';

export const dynamic = 'force-dynamic';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);

/** 解析 ?since=<seq>（非法/缺省为 undefined，等价整场回放） */
function parseSince(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get('since');
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 1 ? value : undefined;
}

/**
 * GET /api/tasks/:id/events：SSE 任务事件流（v2.8 观察者语义）。
 * - 活跃 job：返回总线观察器（含本场回放；`?since=` 续传），断开不 abort；
 * - queued 且无 job：解析 launch 依赖后启动服务端后台作业，再返回观察器；
 * - running/paused 但无 job（容器重载竞态）：收敛为 interrupted 后回放；
 * - 终态：回放已落库步骤 + run_finished 后关闭。
 * 同一运行可被多个观察者订阅；不再返回 409。
 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createTaskRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) throw ApiError.notFound('任务', id);

  const since = parseSince(request);
  const observer = services.taskRunner.observe(id, since);
  if (observer) return sseResponse(observer);

  if (TERMINAL_STATUSES.has(run.status)) {
    return replayTerminalRun(run, repo.listSteps(id));
  }

  if (run.status !== 'queued') {
    // 非活跃但仍 running/paused：服务重启或容器重载遗留，明确收敛而非继续假装运行
    convergeOrphanTaskRun(services.db, id);
    const latest = repo.getRun(id) ?? run;
    return replayTerminalRun(latest, repo.listSteps(id));
  }

  // queued：解析 launch 依赖（assistant/model/vision），失败抛 422
  const { planner, allowedTools, visionCapable } = resolveTaskLaunchArtifacts(services, run);
  const events = services.taskRunner.start({
    run,
    planner,
    allowedTools,
    visionCapable,
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
