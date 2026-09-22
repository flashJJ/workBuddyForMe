import { describe, expect, it } from 'vitest';
import { executeToolCall } from './tool-executor';
import { knowledgeSearchTool } from './knowledge-search-tool';
import { currentTimeTool } from './current-time-tool';
import type { RetrievedChunk } from '../retrieval/retrieval-service';
import type { ToolContext } from './types';

const noKb: ToolContext = { knowledgeBaseId: null, retrieve: async () => [] };

function ctxWithKb(chunks: RetrievedChunk[]): ToolContext {
  return {
    knowledgeBaseId: 'kb-1',
    retrieve: async () => chunks,
  };
}

const CHUNK: RetrievedChunk = {
  documentId: 'd1',
  documentName: '员工手册.pdf',
  ordinal: 1,
  content: '年假为 5 天',
  distance: 0.12,
  sourceUrl: null,
};

describe('knowledge_search 工具', () => {
  it('未绑定知识库：ok:false 提示，不调用检索', async () => {
    const result = await executeToolCall(knowledgeSearchTool, { query: '年假' }, noKb);
    expect(result).toMatchObject({ ok: false, summary: '未绑定知识库' });
  });

  it('缺少 query：参数错误', async () => {
    const result = await executeToolCall(knowledgeSearchTool, {}, ctxWithKb([CHUNK]));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('参数错误');
  });

  it('topK 越界（>6）：参数错误', async () => {
    const result = await executeToolCall(
      knowledgeSearchTool,
      { query: 'x', topK: 20 },
      ctxWithKb([CHUNK]),
    );
    expect(result.ok).toBe(false);
  });

  it('命中：正文回灌模型，citations 透传角标', async () => {
    const result = await executeToolCall(
      knowledgeSearchTool,
      { query: '年假几天' },
      ctxWithKb([CHUNK]),
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('年假为 5 天');
    expect(result.summary).toContain('命中 1 个片段');
    expect(result.citations).toEqual([
      {
        documentId: 'd1',
        documentName: '员工手册.pdf',
        ordinal: 0,
        sourceUrl: null,
        snippet: '年假为 5 天',
      },
    ]);
  });

  it('未命中：ok:true 空结果说明', async () => {
    const result = await executeToolCall(knowledgeSearchTool, { query: 'xxx' }, ctxWithKb([]));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('未检索到');
    expect(result.citations).toBeUndefined();
  });
});

describe('current_time 工具', () => {
  it('零依赖返回本机时间，摘要为格式化时间', async () => {
    const result = await executeToolCall(currentTimeTool, {}, noKb);
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/当前时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} 星期/);
    expect(new Date().getFullYear().toString()).toBe(result.summary.slice(0, 4));
  });
});
