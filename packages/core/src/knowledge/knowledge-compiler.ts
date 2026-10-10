/**
 * 知识编译器服务（v1.3 M2/T2.5/T2.6）。
 *
 * 单文档编译编排：读分片 → stitchChunks 重建虚拟文档 → 规则抽取（零模型、
 * 确定性）产出 seed → 可选 LLM 增强（默认关，任何失败降级规则 seed）→
 * locateContexts 把原句统一映射回 chunk/页/段 → 世代事务落库。
 *
 * 规则通道全程不发起任何网络/模型调用；编译失败只翻转 compile_status，
 * 不影响 documents.status 与既有向量/FTS 检索。
 */

import {
  createChunkRepository,
  createCompileWriteRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  type CompilationInput,
  type CompileEntityInput,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { extractRuleEntities } from './entity-extractor';
import { locateContexts } from './locate-mentions';
import { extractRuleSummary } from './rule-extractor';
import { stitchChunks } from './stitch-chunks';

/** 描述字段（代表性原句）入库上限，防止整句撑大行宽 */
const DESCRIPTION_MAX = 200;

export interface KnowledgeEntitySeed {
  name: string;
  normalizedName: string;
  kind: string;
  aliases: string[];
  /** 出现处原句（必须是缝合文本的逐字片段，定位失败的条目会被丢弃） */
  contexts: string[];
}

export interface CompiledSeed {
  tldr: string;
  bullets: string[];
  keyTerms: string[];
  extractor: 'rule' | 'llm';
  modelId: string | null;
  entities: KnowledgeEntitySeed[];
}

/**
 * LLM 增强通道（T2.6 注入）。返回 null 表示放弃增强（实现内部吞错降级）；
 * 返回 seed 必须通过「逐字原句」校验，坐标解析由编译器统一完成。
 */
export type KnowledgeEnhancer = (input: {
  documentId: string;
  stitchedText: string;
  rule: CompiledSeed;
  signal?: AbortSignal;
}) => Promise<CompiledSeed | null>;

export interface CompileDocumentOptions {
  enhancer?: KnowledgeEnhancer;
  signal?: AbortSignal;
}

export interface CompileDocumentResult {
  generation: number;
  entityCount: number;
  mentionCount: number;
  extractor: 'rule' | 'llm';
  modelId: string | null;
}

/** 规则抽取 → seed（mention 去重为原句集合，坐标稍后统一解析） */
function ruleSeed(stitchedText: string): CompiledSeed {
  const summary = extractRuleSummary(stitchedText);
  return {
    tldr: summary.tldr,
    bullets: summary.bullets,
    keyTerms: summary.keyTerms,
    extractor: 'rule',
    modelId: null,
    entities: extractRuleEntities(stitchedText).map((entity) => ({
      name: entity.name,
      normalizedName: entity.normalizedName,
      kind: entity.kind,
      aliases: entity.aliases,
      contexts: [...new Set(entity.mentions.map((m) => m.context))],
    })),
  };
}

/** seed → 入库结构；原句经 locateContexts 解析坐标，无坐标实体丢弃 */
function toCompilationInput(
  knowledgeBaseId: string,
  documentId: string,
  stitched: ReturnType<typeof stitchChunks>,
  seed: CompiledSeed,
): CompilationInput {
  const entities: CompileEntityInput[] = [];
  for (const entity of seed.entities) {
    const located = locateContexts(stitched.text, stitched.runs, entity.contexts);
    if (located.length === 0) continue;
    entities.push({
      name: entity.name,
      normalizedName: entity.normalizedName,
      kind: entity.kind,
      aliases: entity.aliases,
      description: located[0]!.context.slice(0, DESCRIPTION_MAX),
      mentions: located.map((item) => ({
        context: item.context,
        chunkId: item.location.chunkId,
        pageNo: item.location.pageNo,
        paragraphNo: item.location.paragraphNo,
      })),
    });
  }
  return {
    knowledgeBaseId,
    documentId,
    summary: {
      tldr: seed.tldr,
      bullets: seed.bullets,
      keyTerms: seed.keyTerms,
      extractor: seed.extractor,
      modelId: seed.modelId,
    },
    entities,
  };
}

/** 编译单个文档；调用方（M4 队列）负责并发/串行与重试策略 */
export async function compileDocument(
  deps: ServiceDeps,
  documentId: string,
  options: CompileDocumentOptions = {},
): Promise<CompileDocumentResult> {
  const documentRepo = createDocumentRepository(deps.db);
  const kbRepo = createKnowledgeRepository(deps.db);
  const chunkRepo = createChunkRepository(deps.db);
  const writeRepo = createCompileWriteRepository(deps.db);

  const document = documentRepo.findById(documentId);
  if (!document) throw new Error(`document not found: ${documentId}`);

  writeRepo.updateCompileStatus(documentId, 'running');

  try {
    const kb = kbRepo.findById(document.knowledgeBaseId);
    if (!kb) throw new Error(`knowledge base not found: ${document.knowledgeBaseId}`);
    const chunks = chunkRepo.listByDocument(documentId);
    if (chunks.length === 0) throw new Error(`document has no chunks: ${documentId}`);

    const stitched = stitchChunks(
      chunks.map((chunk) => ({
        id: chunk.id,
        ordinal: chunk.ordinal,
        content: chunk.content,
        pageNo: chunk.pageNo ?? null,
        paragraphNo: chunk.paragraphNo ?? null,
      })),
      // chunking 重叠窗口 + 片内 '\n\n' 连接留白
      { maxOverlap: kb.chunkOverlap + 2 },
    );

    const rule = ruleSeed(stitched.text);
    let seed = rule;
    if (options.enhancer) {
      try {
        const enhanced = await options.enhancer({
          documentId,
          stitchedText: stitched.text,
          rule,
          signal: options.signal,
        });
        if (enhanced) seed = enhanced;
      } catch {
        // 增强通道任何异常都降级规则产物（extractor 保持 'rule'）
        seed = rule;
      }
    }

    const saved = writeRepo.saveCompilation(
      toCompilationInput(kb.id, documentId, stitched, seed),
    );
    return {
      ...saved,
      extractor: seed.extractor,
      modelId: seed.modelId,
    };
  } catch (error) {
    writeRepo.updateCompileStatus(documentId, 'failed', {
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    });
    throw error;
  }
}
