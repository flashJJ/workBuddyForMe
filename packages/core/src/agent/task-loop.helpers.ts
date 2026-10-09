import { vi } from 'vitest';
import type { TaskRunView } from '@wbfm/shared/schemas';
import type { Tool, ToolResult } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TaskLoopEvent } from './control';
import type { TaskPlanner, TaskPlanDecision } from './types';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mockTool(name: string, permission: Tool['permission'], run: () => Promise<ToolResult>): Tool {
  return { name, description: '', parameters: {}, permission, run: vi.fn(run) };
}

const okObserve = () =>
  Promise.resolve({ ok: true, output: '已截取屏幕：成品 100x100', summary: '截图', images: [{ mimeType: 'image/png', dataBase64: PNG_BASE64 }] });

function makeRuntime(tools: Record<string, Tool>): ToolRuntime {
  return { resolveTool: (name: string) => (tools[name] ? { tool: tools[name], source: 'builtin' } : null) } as unknown as ToolRuntime;
}

/** 恒定决策器：每次返回同一决策（上限/急停场景） */
function constantPlanner(decision: TaskPlanDecision, onDecide?: (callIndex: number) => void): TaskPlanner {
  let index = 0;
  return {
    decide: async () => {
      onDecide?.(index);
      index += 1;
      return decision;
    },
  };
}

/** 顺序决策器：按队列依次返回决策；耗尽后返回 done */
function sequencePlanner(decisions: TaskPlanDecision[], onDecide?: (callIndex: number) => void): TaskPlanner {
  let index = 0;
  return {
    decide: async () => {
      onDecide?.(index);
      index += 1;
      return decisions[index - 1] ?? { action: 'done', reason: '默认收尾', message: '完成' };
    },
  };
}

/** 收集异步生成器全部事件与终态 */
async function collect(gen: AsyncGenerator<TaskLoopEvent, TaskRunView>, onEvent?: (e: TaskLoopEvent) => void) {
  const events: TaskLoopEvent[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, final: step.value };
    events.push(step.value);
    onEvent?.(step.value);
  }
}

export { mockTool, okObserve, makeRuntime, constantPlanner, sequencePlanner, collect };
