import type { FlowNodeHandler } from '../types';
import { formatContextBlock } from '../../retrieval/context-formatter';

/**
 * knowledgeSearch 节点：在指定知识库内语义检索。
 * 输出 chunks（结构化）与 context（拼好的参考资料块，可直接插值给 llm 节点）。
 */
export type KnowledgeSearchNodeConfig = {
  knowledgeBaseId: string;
  query: string;
  topK?: number;
};

export interface SearchChunkView {
  documentId: string;
  documentName: string;
  ordinal: number;
  content: string;
  distance: number;
  sourceUrl: string | null;
}

export interface KnowledgeSearchNodeOutputs {
  chunks: SearchChunkView[];
  /** 注入提示词用的参考资料文本；未命中为空串 */
  context: string;
}

const DEFAULT_TOP_K = 4;

export const knowledgeSearchNodeHandler: FlowNodeHandler<
  KnowledgeSearchNodeConfig,
  KnowledgeSearchNodeOutputs
> = {
  type: 'knowledgeSearch',
  async run(config, ctx) {
    if (!ctx.retrieve) {
      throw new Error('当前运行环境未配置知识检索能力（knowledgeSearch 节点不可用）');
    }
    const knowledgeBaseId = String(config.knowledgeBaseId ?? '').trim();
    const query = String(config.query ?? '').trim();
    if (!knowledgeBaseId) throw new Error('knowledgeSearch 节点未选择知识库');
    if (!query) throw new Error('knowledgeSearch 节点的检索词不能为空');

    const chunks = await ctx.retrieve(query, knowledgeBaseId, config.topK ?? DEFAULT_TOP_K);
    return {
      chunks: chunks.map((c) => ({
        documentId: c.documentId,
        documentName: c.documentName,
        ordinal: c.ordinal,
        content: c.content,
        distance: c.distance,
        sourceUrl: c.sourceUrl,
      })),
      context: chunks.length > 0 ? formatContextBlock(chunks) : '',
    };
  },
};
