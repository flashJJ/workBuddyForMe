import { describe, expect, it } from 'vitest';
import type { Assistant } from '@wbfm/shared/types';
import type { ServiceDeps } from '../services/base/deps';
import { createToolRuntime } from './tool-runtime';
import { toToolDefinitions } from './types';
import type { Tool } from './types';

function assistantWith(
  enabledTools: Assistant['enabledTools'],
  knowledgeBaseIds: string[] = [],
) {
  return {
    enabledTools,
    knowledgeBaseIds,
  } as Assistant;
}

const deps = {} as ServiceDeps;
const runtime = createToolRuntime(deps);

describe('工具运行时白名单', () => {
  it('按助手白名单构造工具，未授权的工具不下发', () => {
    const map = runtime.buildTools(
      assistantWith(['current_time', 'fetch_webpage']),
      true,
    );
    expect([...map.keys()].sort()).toEqual(['current_time', 'fetch_webpage']);
  });

  it('模型不支持工具调用时一律返回空映射', () => {
    const map = runtime.buildTools(assistantWith(['current_time']), false);
    expect(map.size).toBe(0);
  });

  it('白名单为空时返回空映射', () => {
    const map = runtime.buildTools(assistantWith([]), true);
    expect(map.size).toBe(0);
  });

  it('toToolDefinitions 输出 OpenAI function 声明', () => {
    const map = runtime.buildTools(assistantWith(['current_time']), true);
    const defs = toToolDefinitions([...map.values()]);
    expect(defs).toEqual([
      {
        type: 'function',
        function: {
          name: 'current_time',
          description: expect.stringContaining('当前'),
          parameters: expect.any(Object),
        },
      },
    ]);
  });

  it('createContext 透传知识库绑定与中断信号', () => {
    const controller = new AbortController();
    const ctx = runtime.createContext(assistantWith([], ['kb-9']), controller.signal);
    expect(ctx.knowledgeBaseIds).toEqual(['kb-9']);
    expect(ctx.signal).toBe(controller.signal);
    expect(typeof ctx.retrieve).toBe('function');
  });

  it('listDebugTools 返回 24 个内置工具，每个含 source/permission/description/parameters', () => {
    const list = runtime.listDebugTools();
    expect(list.map((t) => t.name).sort()).toEqual([
      'app_launch',
      'artifact_write',
      'browser_click',
      'browser_close',
      'browser_open',
      'browser_read',
      'browser_snapshot',
      'browser_type',
      'capability_install',
      'capability_search',
      'current_time',
      'fetch_webpage',
      'keyboard_press',
      'keyboard_type',
      'knowledge_search',
      'mouse_click',
      'mouse_move',
      'mouse_scroll',
      'screen_snapshot',
      'todo_write',
      'uia_list',
      'web_search',
      'window_focus',
      'window_list',
    ]);
    for (const info of list) {
      expect(info.source).toBe('builtin');
      expect(info.description).toBeTruthy();
      expect(info.parameters).toBeTypeOf('object');
    }
    // fetch_webpage 标 danger；screen_snapshot 标 read
    const fetch = list.find((t) => t.name === 'fetch_webpage');
    expect(fetch?.permission).toBe('danger');
    const snapshot = list.find((t) => t.name === 'screen_snapshot');
    expect(snapshot?.permission).toBe('read');
    // M2 键鼠 danger；窗口列举 read
    expect(list.find((t) => t.name === 'mouse_click')?.permission).toBe('danger');
    expect(list.find((t) => t.name === 'window_list')?.permission).toBe('read');
  });

  it('createDebugToolContext 不绑知识库，retrieve 返回空数组', async () => {
    const controller = new AbortController();
    const ctx = runtime.createDebugToolContext(controller.signal);
    expect(ctx.knowledgeBaseIds).toEqual([]);
    expect(ctx.signal).toBe(controller.signal);
    await expect(ctx.retrieve('q', 5)).resolves.toEqual([]);
  });
});

describe('v2.17 能力目录上下文与下一轮绑定', () => {
  const catalog = {
    search: () => [],
    install: () => {
      throw new Error('本用例不触发安装');
    },
  } as unknown as NonNullable<ServiceDeps['capabilityCatalog']>;

  it('装配目录后暴露检索/安装回调与助手 id', () => {
    const ctx = createToolRuntime({ ...deps, capabilityCatalog: catalog }).createContext(
      { ...assistantWith([]), id: 'asst-1', name: '助手' } as Assistant,
    );
    expect(ctx.assistantId).toBe('asst-1');
    expect(ctx.searchCapabilities).toBeTypeOf('function');
    expect(ctx.installCapability).toBeTypeOf('function');
    expect(ctx.bindTools).toBeUndefined();
  });

  it('安装后只绑定只读工具，write/danger 跳过并回写白名单', () => {
    const bound: Array<{ assistantId: string; enabledTools: string[] }> = [];
    const boundRuntime = createToolRuntime({
      ...deps,
      capabilityCatalog: catalog,
      bindAssistantTools: (assistantId, enabledTools) => {
        bound.push({ assistantId, enabledTools });
      },
    });
    const assistant = {
      ...assistantWith(['current_time']),
      id: 'asst-2',
      name: '助手',
    } as Assistant;
    const ctx = boundRuntime.createContext(assistant);
    const result = ctx.bindTools!(['current_time', 'mouse_click', 'capability_search']);
    expect(result).toEqual({ added: ['capability_search'], skipped: ['mouse_click'] });
    expect(bound).toEqual([
      { assistantId: 'asst-2', enabledTools: ['current_time', 'capability_search'] },
    ]);
    // 同一轮第二次安装不清空前一次新增
    const second = ctx.bindTools!(['web_search']);
    expect(second).toEqual({ added: ['web_search'], skipped: [] });
    expect(bound[1]?.enabledTools).toEqual([
      'current_time',
      'capability_search',
      'web_search',
    ]);
  });

  it('回写后的白名单在下一轮 buildTools 生效', () => {
    const assistant = {
      ...assistantWith(['current_time']),
      id: 'asst-3',
      name: '助手',
    } as Assistant;
    const nextTurn = { ...assistant, enabledTools: ['current_time', 'capability_search'] };
    const map = runtime.buildTools(nextTurn, true);
    expect([...map.keys()].sort()).toEqual(['capability_search', 'current_time']);
  });
});

describe('工具运行时第三来源：flow 工具（v0.8 M1）', () => {
  const flowTool: Tool = {
    name: 'flow:wf-123',
    description: '已发布工作流',
    parameters: { type: 'object' },
    permission: 'read',
    async run() {
      return { ok: true, output: 'done', summary: 'ran' };
    },
  };

  it('flow:<id> 经 deps.flowToolResolver 解析，来源标记为 flow', () => {
    const runtimeWithFlow = createToolRuntime({
      ...deps,
      flowToolResolver: (workflowId) => (workflowId === 'wf-123' ? flowTool : null),
    });
    const resolved = runtimeWithFlow.resolveTool('flow:wf-123');
    expect(resolved?.tool).toBe(flowTool);
    expect(resolved?.source).toBe('flow');
  });

  it('未注册 resolver / 工作流不存在时返回 null（不影响内置与 MCP 解析）', () => {
    expect(runtime.resolveTool('flow:anything')).toBeNull();
    const runtimeMissing = createToolRuntime({
      ...deps,
      flowToolResolver: () => null,
    });
    expect(runtimeMissing.resolveTool('flow:x')).toBeNull();
    // 内置工具解析不受影响
    expect(runtimeMissing.resolveTool('current_time')?.source).toBe('builtin');
  });

  it('flow 工具可进入助手白名单并下发为 function 声明', () => {
    const runtimeWithFlow = createToolRuntime({
      ...deps,
      flowToolResolver: () => flowTool,
    });
    const map = runtimeWithFlow.buildTools(assistantWith(['flow:wf-123']), true);
    expect([...map.keys()]).toEqual(['flow:wf-123']);
    expect(toToolDefinitions([...map.values()])[0]?.function.name).toBe('flow:wf-123');
  });
});
