import { describe, expect, it } from 'vitest';
import type { ChatMessage, ToolCall } from '@wbfm/ai';
import { runToolCallLoop } from '../tool-call-loop';
import type { OrchestratorEvent } from '../../base/types';
import type { Tool, ToolContext, ToolMap, ToolResult } from '../../../tools/types';
import type { ToolRuntime } from '../../../tools/tool-runtime';
import type { ServiceDeps } from '../../../services/base/deps';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  for await (const _event of generator) {
    // 只关心副作用：outgoing / trace / 执行次数
  }
}

function fetchTool(onRun: (url: string) => Promise<ToolResult> | ToolResult): Tool {
  return {
    name: 'fetch_webpage',
    description: '抓取网页',
    parameters: { type: 'object' },
    permission: 'read',
    async run(rawArgs, _ctx: ToolContext): Promise<ToolResult> {
      const url = (rawArgs as { url: string }).url;
      return onRun(url);
    },
  };
}

function callsOf(urls: string[]): ToolCall[] {
  return urls.map((url, index) => ({
    id: `call-${index}`,
    type: 'function' as const,
    function: { name: 'fetch_webpage', arguments: JSON.stringify({ url }) },
  }));
}

function runLoop(
  calls: ToolCall[],
  tool: Tool,
  outgoing: ChatMessage[],
  options: { contextWindow?: number; researchDepth?: 'frugal' | 'standard' | 'deep' } = {},
) {
  return runToolCallLoop({
    calls,
    toolMap: new Map([[tool.name, tool]]) as ToolMap,
    toolCtx: { knowledgeBaseIds: [], retrieve: async () => [] },
    deps: {} as ServiceDeps,
    runtime: { resolveTool: () => ({ tool, source: 'builtin' }) } as unknown as ToolRuntime,
    assistantId: 'a1',
    turnTrace: null,
    trace: [],
    outgoing,
    citations: [],
    toolMessageBudgetTokens: 4096,
    ...(options.contextWindow ? { contextWindow: options.contextWindow } : {}),
    ...(options.researchDepth ? { researchDepth: options.researchDepth } : {}),
    onAbort: () => undefined,
  });
}

describe('runToolCallLoop：v4.11 同轮联网并发', () => {
  it('不同 URL 的抓取并发执行，回灌顺序仍按模型调用顺序', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tool = fetchTool(async (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return { ok: true, output: `正文 ${url}`, summary: url };
    });
    const outgoing: ChatMessage[] = [];
    await drain(runLoop(callsOf(['https://a.com', 'https://b.com']), tool, outgoing));

    expect(maxInFlight).toBe(2);
    expect(outgoing.filter((m) => m.role === 'tool').map((m) => m.content)).toEqual([
      '正文 https://a.com',
      '正文 https://b.com',
    ]);
  });

  it('派发前预占次数：单轮第 4 个抓取被预算直接拒绝', async () => {
    let runs = 0;
    const tool = fetchTool((url) => {
      runs += 1;
      return { ok: true, output: `正文 ${url}`, summary: url };
    });
    const outgoing: ChatMessage[] = [];
    await drain(
      runLoop(
        callsOf(['a', 'b', 'c', 'd'].map((host) => `https://${host}.com`)),
        tool,
        outgoing,
        // 节省档：单轮 3 次抓取上限，第 4 个应被预算拒绝
        { contextWindow: 8_192, researchDepth: 'frugal' },
      ),
    );

    expect(runs).toBe(3);
    expect(outgoing.filter((m) => m.role === 'tool').at(-1)?.content).toContain('已达上限');
  });
});
