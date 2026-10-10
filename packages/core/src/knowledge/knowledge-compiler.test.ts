import { describe, expect, it, beforeEach } from 'vitest';
import {
  createChunkRepository,
  createCompileQueryRepository,
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { compileDocument, type CompiledSeed } from './knowledge-compiler';
import { createStaticKnowledgeService } from './static-knowledge-service';

function depsFor(db: DatabaseInstance): ServiceDeps {
  return { db } as unknown as ServiceDeps;
}

/** 两片带 10 字重叠的分片，坐标分别在第 1/2 页 */
function seedDocument(db: DatabaseInstance): { kbId: string; docId: string } {
  const kb = createKnowledgeRepository(db).create({
    name: '库',
    chunkSize: 200,
    chunkOverlap: 10,
  });
  const docId = createDocumentRepository(db).create({
    knowledgeBaseId: kb.id,
    filename: 'model.txt',
    fileType: '.txt',
    byteSize: 1,
    contentHash: 'h',
  }).id;
  const first = 'Qwen2.5 是一个对话模型。Qwen2.5 兼容 OpenAI 接口。';
  const second = first.slice(-10) + '模型支持流式输出。';
  createChunkRepository(db).bulkInsert(docId, [
    { ordinal: 0, content: first, charStart: 0, charEnd: first.length, pageNo: 1, paragraphNo: 1 },
    { ordinal: 1, content: second, charStart: first.length - 10, charEnd: first.length - 10 + second.length, pageNo: 2, paragraphNo: 2 },
  ]);
  return { kbId: kb.id, docId };
}

describe('compileDocument 编译器服务', () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('规则通道：落库 ready/世代 1，实体 mention 带正确页/片坐标', async () => {
    const { docId } = seedDocument(db);
    const result = await compileDocument(depsFor(db), docId);
    expect(result.extractor).toBe('rule');
    expect(result.generation).toBe(1);

    const doc = db
      .prepare(`SELECT compile_status AS s, compile_generation AS g FROM documents WHERE id=?`)
      .get(docId) as { s: string; g: number };
    expect(doc).toEqual({ s: 'ready', g: 1 });

    const summary = db
      .prepare(`SELECT extractor AS e, tldr AS t FROM document_summaries WHERE document_id=?`)
      .get(docId) as { e: string; t: string };
    expect(summary.e).toBe('rule');
    expect(summary.t).toContain('Qwen2.5');

    const mentions = db
      .prepare(
        `SELECT m.context AS context, m.page_no AS pageNo, c.ordinal AS ordinal
         FROM knowledge_entity_mentions m
         LEFT JOIN document_chunks c ON c.id = m.chunk_id
         JOIN knowledge_entities e ON e.id = m.entity_id
         WHERE e.normalized_name = 'qwen25' AND m.document_id = ?
         ORDER BY m.context`,
      )
      .all(docId) as Array<{ context: string; pageNo: number; ordinal: number }>;
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    expect(mentions.every((m) => m.context.includes('Qwen2.5'))).toBe(true);
    expect(mentions.some((m) => m.pageNo === 1)).toBe(true);
  });

  it('编译后静态检索可命中实体原句（端到端纯本地）', async () => {
    const { kbId, docId } = seedDocument(db);
    await compileDocument(depsFor(db), docId);

    const facts = createStaticKnowledgeService(depsFor(db)).retrieve(
      kbId,
      'Qwen2.5 兼容什么接口？',
    );
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0]!.kind).toBe('entity');
    expect(facts[0]!.text).toBe('Qwen2.5 兼容 OpenAI 接口。');
    expect(facts[0]!.documentName).toBe('model.txt');
  });

  it('LLM 增强：采纳落在第 2 页的原句，幻觉句丢弃，extractor=llm', async () => {
    const { docId } = seedDocument(db);
    const enhancer = async ({ rule }: { rule: CompiledSeed }): Promise<CompiledSeed> => ({
      tldr: '模型支持流式输出。',
      bullets: ['模型支持流式输出。'],
      // 真实 LLM 增强器约定：keyTerms 始终沿用规则通道机械产物
      keyTerms: rule.keyTerms,
      extractor: 'llm',
      modelId: 'chat-x',
      entities: [
        {
          name: 'Qwen2.5',
          normalizedName: 'qwen2.5',
          kind: 'product',
          aliases: [],
          contexts: ['模型支持流式输出。', '模型根本没有说过的幻觉原句。'],
        },
      ],
    });
    const result = await compileDocument(depsFor(db), docId, { enhancer });
    expect(result.extractor).toBe('llm');
    expect(result.modelId).toBe('chat-x');

    const contexts = db
      .prepare(
        `SELECT m.context AS context, m.page_no AS pageNo, s.key_terms AS keyTerms
         FROM knowledge_entity_mentions m, document_summaries s
         WHERE s.document_id = ?`,
      )
      .all(docId) as Array<{ context: string; pageNo: number; keyTerms: string }>;
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context).toBe('模型支持流式输出。');
    expect(contexts[0]!.pageNo).toBe(2);
    // keyTerms 始终沿用规则通道机械产物（保留型号原词形）
    expect(contexts[0]!.keyTerms).toContain('Qwen2.5');
  });

  it('增强器抛错时整体降级规则通道，文档仍 ready', async () => {
    const { docId } = seedDocument(db);
    const result = await compileDocument(depsFor(db), docId, {
      enhancer: async () => {
        throw new Error('boom');
      },
    });
    expect(result.extractor).toBe('rule');
    const status = (
      db.prepare(`SELECT compile_status AS s FROM documents WHERE id=?`).get(docId) as {
        s: string;
      }
    ).s;
    expect(status).toBe('ready');
  });

  it('无分片文档编译失败：抛错且状态 failed，不产生摘要', async () => {
    const kb = createKnowledgeRepository(db).create({
      name: '空库',
      chunkSize: 200,
      chunkOverlap: 10,
    });
    const docId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'empty.txt',
      fileType: '.txt',
      byteSize: 1,
      contentHash: 'h2',
    }).id;
    await expect(compileDocument(depsFor(db), docId)).rejects.toThrow(/no chunks/);
    const row = db
      .prepare(`SELECT compile_status AS s, compile_error AS e FROM documents WHERE id=?`)
      .get(docId) as { s: string; e: string | null };
    expect(row.s).toBe('failed');
    expect(row.e).toContain('no chunks');
    expect(createCompileQueryRepository(db).getDocumentSummary(docId)).toBeNull();
  });
});
