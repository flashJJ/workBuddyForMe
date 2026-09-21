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
});
