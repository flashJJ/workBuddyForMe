import { describe, expect, it, vi } from 'vitest';
import { debugExecuteTool } from './debug-executor';
import type { ToolRuntime, ResolvedTool } from './tool-runtime';
import { ToolArgError, type Tool } from './types';

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'echo',
    description: 'echo 工具',
    parameters: { type: 'object', properties: {} },
    permission: 'read',
    run: async () => ({ ok: true, output: 'echoed', summary: 'echoed' }),
    ...overrides,
  };
}

function makeRuntime(resolved: ResolvedTool | null, tool?: Tool): ToolRuntime {
  return {
    resolveTool: () => resolved,
    buildTools: () => new Map(tool ? [[tool.name, tool]] : []),
    createContext: () => ({ signal: undefined, knowledgeBaseId: null, retrieve: async () => [] }),
    createDebugToolContext: (signal) => ({ signal, knowledgeBaseId: null, retrieve: async () => [] }),
    listDebugTools: () => [],
  };
}

describe('debug-executor（v0.6 M4）', () => {
  it('工具不存在/未启用：返回 ok:false 与未启用提示', async () => {
    const runtime = makeRuntime(null);
    const result = await debugExecuteTool({ runtime, name: 'no_such', args: {} });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('no_such');
    expect(result.summary).toBe('工具未启用');
  });

  it('内置工具正常执行：透传 output/summary', async () => {
    const tool = makeTool({ name: 'echo' });
    const runtime = makeRuntime({ tool, source: 'builtin' }, tool);
    const result = await debugExecuteTool({ runtime, name: 'echo', args: { x: 1 } });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('echoed');
    expect(result.summary).toBe('echoed');
  });

  it('传入 signal 被转发到 ToolContext；中断时返回失败摘要', async () => {
    let capturedSignal: AbortSignal | undefined;
    const slowTool: Tool = {
      name: 'mcp:slow:fetch',
      description: '慢工具',
      parameters: { type: 'object', properties: {} },
      permission: 'read',
      run: async (_args, ctx) =>
        new Promise((_resolve, reject) => {
          capturedSignal = ctx.signal;
          ctx.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    };
    const runtime = makeRuntime({ tool: slowTool, source: 'mcp:slow' }, slowTool);
    const controller = new AbortController();
    const pending = debugExecuteTool({
      runtime,
      name: 'mcp:slow:fetch',
      args: {},
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);
    expect(result.summary).toBe('用户已中断');
  });

  it('参数错误：归一为 ok:false 文本，不抛出', async () => {
    const tool: Tool = {
      name: 'echo',
      description: '',
      parameters: { type: 'object', properties: {} },
      permission: 'read',
      run: async (raw) => {
        if (!raw || typeof raw !== 'object' || !('q' in raw)) {
          throw new ToolArgError('缺少 q');
        }
        return { ok: true, output: '', summary: '' };
      },
    };
    const runtime = makeRuntime({ tool, source: 'builtin' }, tool);
    const result = await debugExecuteTool({ runtime, name: 'echo', args: {} });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('参数错误');
    expect(result.output).toContain('缺少 q');
  });

  it('调用 runtime.resolveTool + createDebugToolContext', async () => {
    const tool = makeTool();
    const resolveSpy = vi.fn(() => ({ tool, source: 'builtin' } as ResolvedTool));
    const ctxSpy = vi.fn((signal?: AbortSignal) => ({
      signal,
      knowledgeBaseId: null,
      retrieve: async () => [],
    }));
    const runtime: ToolRuntime = {
      resolveTool: resolveSpy,
      buildTools: () => new Map(),
      createContext: () => ({ signal: undefined, knowledgeBaseId: null, retrieve: async () => [] }),
      createDebugToolContext: ctxSpy,
      listDebugTools: () => [],
    };
    await debugExecuteTool({ runtime, name: 'echo', args: {} });
    expect(resolveSpy).toHaveBeenCalledWith('echo');
    expect(ctxSpy).toHaveBeenCalled();
  });
});
