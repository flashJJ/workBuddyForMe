import { describe, expect, it } from 'vitest';
import type { Assistant } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { createToolRuntime } from './tool-runtime';
import { toToolDefinitions } from './types';

function assistantWith(enabledTools: Assistant['enabledTools'], knowledgeBaseId: string | null = null) {
  return {
    enabledTools,
    knowledgeBaseId,
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
    const ctx = runtime.createContext(assistantWith([], 'kb-9'), controller.signal);
    expect(ctx.knowledgeBaseId).toBe('kb-9');
    expect(ctx.signal).toBe(controller.signal);
    expect(typeof ctx.retrieve).toBe('function');
  });

  it('listDebugTools 返回 13 个内置工具，每个含 source/permission/description/parameters', () => {
    const list = runtime.listDebugTools();
    expect(list.map((t) => t.name).sort()).toEqual([
      'app_launch',
      'current_time',
      'fetch_webpage',
      'keyboard_press',
      'keyboard_type',
      'knowledge_search',
      'mouse_click',
      'mouse_move',
      'mouse_scroll',
      'screen_snapshot',
      'uia_list',
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
    expect(ctx.knowledgeBaseId).toBeNull();
    expect(ctx.signal).toBe(controller.signal);
    await expect(ctx.retrieve('q', 5)).resolves.toEqual([]);
  });
});
