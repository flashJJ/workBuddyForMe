import { describe, expect, it } from 'vitest';
import { executeCall, executeToolCall, parseToolArgs, summarizeArgs } from './tool-executor';
import { ToolArgError, type Tool, type ToolContext } from './types';

const baseCtx: ToolContext = {
  knowledgeBaseIds: [],
  retrieve: async () => [],
};

const okTool: Tool = {
  name: 'current_time',
  description: 'ok',
  parameters: {},
  async run() {
    return { ok: true, output: '结果正文', summary: '摘要' };
  },
};

describe('工具执行器', () => {
  it('正常执行：透传 output/summary', async () => {
    const result = await executeToolCall(okTool, {}, baseCtx);
    expect(result).toMatchObject({ ok: true, output: '结果正文', summary: '摘要' });
  });

  it('透传 artifacts/evidence（只展示，不写入 output）', async () => {
    const rich: Tool = {
      name: 'diagram_render',
      description: '',
      parameters: {},
      async run() {
        return {
          ok: true,
          output: '已生成图表',
          summary: '图表 · 12 KB',
          artifacts: [
            {
              attachmentId: 'att-1',
              title: '架构图',
              filename: 'architecture.html',
              format: 'html',
              mimeType: 'text/html',
              byteSize: 12,
            },
          ],
          evidence: {
            source: 'mock-search',
            coverage: '3 条结果',
            limitations: ['摘要截断'],
            capturedAt: '2026-11-02T00:00:00.000Z',
          },
        };
      },
    };
    const result = await executeToolCall(rich, {}, baseCtx);
    expect(result.output).toBe('已生成图表');
    expect(result.artifacts?.[0]?.attachmentId).toBe('att-1');
    expect(result.evidence).toMatchObject({
      source: 'mock-search',
      coverage: '3 条结果',
      limitations: ['摘要截断'],
    });
  });

  it('ToolArgError 归一为 ok:false 文本，给模型自我纠正机会', async () => {
    const badArgs: Tool = {
      name: 'knowledge_search',
      description: '',
      parameters: {},
      async run(raw) {
        if (!raw || typeof raw !== 'object' || !('query' in raw)) {
          throw new ToolArgError('缺少 query');
        }
        return { ok: true, output: '', summary: '' };
      },
    };
    const result = await executeToolCall(badArgs, {}, baseCtx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('参数错误');
    expect(result.output).toContain('缺少 query');
  });

  it('超时：超过 timeoutMs 后返回 ok:false，不抛出', async () => {
    const slow: Tool = {
      name: 'fetch_webpage',
      description: '',
      parameters: {},
      run: async (_args, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal?.addEventListener('abort', () =>
            reject(new DOMException('Timeout', 'TimeoutError')),
          );
        }),
    };
    const result = await executeToolCall(slow, {}, baseCtx, 30);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('超时');
    expect(result.evidence?.coverage).toBe('未完成');
    expect(result.evidence?.limitations?.[0]).toContain('超时');
  });

  it('用户中断优先提示“用户已中断”', async () => {
    const controller = new AbortController();
    const slow: Tool = {
      name: 'fetch_webpage',
      description: '',
      parameters: {},
      run: async (_args, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    };
    const pending = executeToolCall(slow, {}, { ...baseCtx, signal: controller.signal }, 5000);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('用户已中断');
  });

  it('executeCall：非法 JSON 归一为参数错误结果', async () => {
    const result = await executeCall(
      okTool,
      { function: { arguments: '{bad json' } },
      baseCtx,
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('参数错误');
  });

  it('parseToolArgs：空串返回空对象，合法 JSON 解析', () => {
    expect(parseToolArgs({ function: { arguments: '  ' } })).toEqual({});
    expect(parseToolArgs({ function: { arguments: '{"query":"x"}' } })).toEqual({ query: 'x' });
    expect(() => parseToolArgs({ function: { arguments: '{' } })).toThrow(ToolArgError);
  });

  it('summarizeArgs：按工具取关键字段并裁剪空白', () => {
    expect(summarizeArgs('current_time', {})).toBe('当前时间');
    expect(summarizeArgs('knowledge_search', { query: '  多行\n 查询 ' })).toBe('多行 查询');
    expect(summarizeArgs('fetch_webpage', { url: 'https://a.com' })).toBe('https://a.com');
  });
});
