import { z } from 'zod';
import type { Tool, ToolResult } from './types';
import { ToolArgError } from './types';
import { formatContextBlock, toCitations } from '../retrieval/context-formatter';

const argsSchema = z.object({
  query: z.string().trim().min(1, '检索词不能为空').max(500),
  topK: z.number().int().min(1).max(6).optional(),
});

const DEFAULT_KNOWLEDGE_TOP_K = 4;

/**
 * knowledge_search：在助手绑定的知识库内做语义检索。
 * 只能访问绑定库（ToolContext.knowledgeBaseId），未绑定直接拒绝。
 * 命中结果同时以 citations 形式透传，编排器据此发引用角标。
 */
export const knowledgeSearchTool: Tool = {
  name: 'knowledge_search',
  description:
    '在用户授权的私有知识库中语义检索资料。当问题可能需要用户文档中的信息（制度、项目资料、历史文档等）时调用；寒暄与常识问题不要调用。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '检索词或完整问题，使用与文档语言一致的关键词',
      },
      topK: {
        type: 'number',
        description: '返回片段数量（1-6），默认 4',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((i) => i.message).join('；'));
    }
    if (!ctx.knowledgeBaseId) {
      return {
        ok: false,
        output: '当前助手未绑定知识库，无法检索。请直接基于常识回答或告知用户未配置知识库。',
        summary: '未绑定知识库',
      };
    }
    const chunks = await ctx.retrieve(
      parsed.data.query,
      parsed.data.topK ?? DEFAULT_KNOWLEDGE_TOP_K,
      ctx.signal,
    );
    if (chunks.length === 0) {
      return {
        ok: true,
        output: '知识库中未检索到相关片段，请基于常识谨慎回答并说明资料中未找到依据。',
        summary: `未命中（${parsed.data.query}）`,
      };
    }
    return {
      ok: true,
      output: formatContextBlock(chunks),
      summary: `命中 ${chunks.length} 个片段：${parsed.data.query}`,
      citations: toCitations(chunks),
    };
  },
};
