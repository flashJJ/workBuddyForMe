import type { ToolResult } from '../../../tools/types';
import { executeCall } from '../../../tools/tool-executor';
import type { OrchestratorEvent } from '../../base/types';
import type { ReadyToolCall, ToolStepContext } from './tool-call-step';

/** 用户取消启动时回灌模型的工具结果文案 */
const CANCELED_OUTPUT = '用户取消了启动本地搜索服务，本次搜索未执行。';

function queryOf(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const query = (args as { query?: unknown }).query;
  return typeof query === 'string' ? query : '';
}

/**
 * v4.16：本机 SearXNG 未运行时，询问用户是否一键启动，并在放行后重试一次搜索。
 *
 * 只有「本机端点不可达」的工具结果才带 needsLocalSearchStart；
 * 决策复用 /api/tools/confirm 挂起确认（allow=已启动/继续，deny=取消）。
 * 同一轮多个搜索并发失败时只提示一次，其余调用直接重试。
 */
export async function* maybeStartLocalSearch(input: {
  ctx: ToolStepContext;
  prepared: ReadyToolCall;
  result: ToolResult;
  alreadyStarted: () => boolean;
  markStarted: () => void;
}): AsyncGenerator<OrchestratorEvent, ToolResult> {
  const { ctx, prepared, result } = input;
  const flag = result.needsLocalSearchStart;
  if (!flag || !prepared.tool || !ctx.deps.confirmations) return result;
  if (ctx.signal?.aborted) return result;

  if (!input.alreadyStarted()) {
    yield {
      event: 'search_local_start_required',
      data: { callId: prepared.call.id, endpoint: flag.endpoint, query: queryOf(prepared.args) },
    };
    const decision = await ctx.deps.confirmations.request(prepared.call.id, ctx.signal);
    if (decision === 'deny' || ctx.signal?.aborted) {
      return { ...result, output: CANCELED_OUTPUT, summary: '本地搜索未启动' };
    }
    input.markStarted();
  }

  // 设置可能已随部署更新（端口变化），search 服务每次调用都会重读设置
  return executeCall(prepared.tool, prepared.call, ctx.toolCtx);
}
