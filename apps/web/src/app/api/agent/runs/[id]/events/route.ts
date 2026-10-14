import { createAgentRunRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { formatSse, type TokenUsage } from '@wbfm/shared/api';
import type { AgentHandoffView, AgentRunView } from '@wbfm/shared/schemas';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { sseResponse } from '@/lib/server/sse-stream';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled', 'budget_exceeded']);

/** 舞台先于 owner SSE 开窗时，服务端最多挂起等待 owner 启动的时长 */
const OBSERVER_WAIT_MS = 10_000;

/**
 * GET /api/agent/runs/:id/events：协作 SSE 事件流。
 * - running 未订阅：启动协作（生命周期 = 本请求；断线联动 abort）。
 *   角色模型/配置错误在启动预检阶段返回 422/404；
 * - running 已订阅：409（主会话只开一个 owner EventSource）
 * - 终态：回放已落库 handoffs（agent_handoffs）+ done 后关闭（页面刷新用）
 *
 * v1.9 M2：?observe=1 为舞台只读第二客户端——不启动/不拥有 run，
 * 断线不 abort（队列所有方在主会话）；活跃 run 走进程内观察总线（含本场回放），
 * running 但 owner 尚未接通时 409，由客户端退避重连。
 */
export const GET = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const observe = new URL(request.url).searchParams.get('observe') === '1';
  const repo = createAgentRunRepository(services.db);
  const run = repo.getById(id);
  if (!run) throw ApiError.notFound('协作运行', id);

  if (observe) {
    const activeObserver = services.agentRuns.observe(id);
    if (activeObserver) return sseResponse(activeObserver);
    if (TERMINAL_STATUSES.has(run.status)) {
      return replayTerminalRun(run, repo.listHandoffs(id));
    }
    // run 已建行但 owner 未接通：舞台有界等待（客户端断线则立刻结束等待）
    const aborted = new Promise<null>((resolve) => {
      if (request.signal.aborted) resolve(null);
      request.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    const observer = await Promise.race([
      services.agentRuns.observeWhenReady(id, OBSERVER_WAIT_MS),
      aborted,
    ]);
    if (!observer) {
      // 等待期间终态落库（未订阅取消/owner 启动失败收敛）→ 回放；仍 running 才 409
      const latest = repo.getById(id);
      if (latest && TERMINAL_STATUSES.has(latest.status)) {
        return replayTerminalRun(latest, repo.listHandoffs(id));
      }
      throw ApiError.conflict('协作正在启动，请稍后重试');
    }
    return sseResponse(observer);
  }

  if (services.agentRuns.isActive(id)) {
    throw ApiError.conflict('协作事件流已被订阅，请勿重复打开');
  }
  if (TERMINAL_STATUSES.has(run.status)) {
    return replayTerminalRun(run, repo.listHandoffs(id));
  }
  const events = await services.agentRuns.start({ run, clientSignal: request.signal });
  return sseResponse(events);
});

/** 终态运行回放：每条 handoff 一帧 agent_handoff，末尾 done（携带最终用量） */
function replayTerminalRun(run: AgentRunView, handoffs: AgentHandoffView[]): Response {
  const encoder = new TextEncoder();
  const usage: TokenUsage = {
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    totalTokens: run.totalTokens,
  };
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
        for (const handoff of handoffs) {
          safeEnqueue(encoder.encode(formatSse('agent_handoff', { runId: run.id, handoff })));
        }
        safeEnqueue(
          encoder.encode(
            formatSse('done', { content: run.finalOutcome?.summary ?? '', usage }),
          ),
        );
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
