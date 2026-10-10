import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { applyMigrations } from '../migrations/runner';
import {
  createCompileQueryRepository,
  createCompileWriteRepository,
  type CompilationInput,
} from './index';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  db.prepare(
    `INSERT INTO knowledge_bases(id,name,chunk_overlap,created_at,updated_at)
     VALUES('kb','库', 20, 't','t')`,
  ).run();
  for (const id of ['d1', 'd2']) {
    db.prepare(
      `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
       VALUES(?, 'kb', ?, 'txt', 1, 'h', 't')`,
    ).run(id, `${id}.txt`);
    db.prepare(
      `INSERT INTO document_chunks(document_id,ordinal,content,page_no,paragraph_no,created_at)
       VALUES(?,0,'分片内容',1,1,'t')`,
    ).run(id);
  }
  return db;
}

function entity(name: string, normalized: string, docId: string, extra?: {
  aliases?: string[];
  context?: string;
}): CompilationInput['entities'][number] {
  return {
    name,
    normalizedName: normalized,
    kind: 'product',
    aliases: extra?.aliases ?? [],
    description: extra?.context ?? '原句描述',
    mentions: [
      { context: extra?.context ?? `${name} 是一个实体。`, chunkId: 1, pageNo: 1, paragraphNo: 1 },
    ],
  };
}

function compilation(docId: string, entities: CompilationInput['entities']): CompilationInput {
  return {
    knowledgeBaseId: 'kb',
    documentId: docId,
    summary: {
      tldr: '文档摘要原句。',
      bullets: ['要点一。', '要点二。'],
      keyTerms: ['混合检索', 'qwen2.5'],
      extractor: 'rule',
    },
    entities,
  };
}

describe('compile-write-repo：世代事务写入', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
  });

  it('首编：世代 1、状态 ready、摘要/实体/mention 落库且坐标完整', () => {
    const write = createCompileWriteRepository(db);
    const result = write.saveCompilation(compilation('d1', [entity('Qwen2.5', 'qwen2.5', 'd1')]));
    expect(result).toEqual({ generation: 1, entityCount: 1, mentionCount: 1 });

    const doc = db
      .prepare(
        `SELECT compile_generation AS gen, compile_status AS status, compiled_at AS at,
                compile_error AS err FROM documents WHERE id='d1'`,
      )
      .get() as { gen: number; status: string; at: string | null; err: string | null };
    expect(doc).toMatchObject({ gen: 1, status: 'ready', err: null });
    expect(doc.at).toBeTruthy();

    const mention = db
      .prepare(
        `SELECT chunk_id AS chunkId, page_no AS pageNo, paragraph_no AS paragraphNo,
                context, generation FROM knowledge_entity_mentions`,
      )
      .get() as { chunkId: number; pageNo: number; paragraphNo: number; context: string; generation: number };
    expect(mention).toMatchObject({ chunkId: 1, pageNo: 1, paragraphNo: 1, generation: 1 });
    expect(mention.context).toContain('Qwen2.5');
  });

  it('重编译：世代+1，mention 不重复，实体行复用，mention_count 重算', () => {
    const write = createCompileWriteRepository(db);
    write.saveCompilation(compilation('d1', [entity('Qwen2.5', 'qwen2.5', 'd1')]));
    const beforeId = (
      db.prepare(`SELECT id FROM knowledge_entities`).get() as { id: string }
    ).id;

    const result = write.saveCompilation(
      compilation('d1', [
        {
          ...entity('Qwen2.5', 'qwen2.5', 'd1', { context: '新世代原句。' }),
          mentions: [
            { context: '新世代原句。', chunkId: 1, pageNo: 1, paragraphNo: 1 },
            { context: '第二处出现。', chunkId: 1, pageNo: null, paragraphNo: 2 },
          ],
        },
      ]),
    );
    expect(result.generation).toBe(2);
    expect(result.mentionCount).toBe(2);

    const rows = db.prepare(`SELECT id FROM knowledge_entities`).all() as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(beforeId);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entity_mentions`).get() as { n: number }).n,
    ).toBe(2);
    expect(
      (
        db.prepare(`SELECT mention_count AS n FROM knowledge_entities`).get() as { n: number }
      ).n,
    ).toBe(2);
  });

  it('跨文档同归一化名归并为一个实体，mention 跨两文档，别名取并集', () => {
    const write = createCompileWriteRepository(db);
    write.saveCompilation(
      compilation('d1', [entity('混合检索', '混合检索', 'd1', { aliases: ['Hybrid Retrieval'] })]),
    );
    write.saveCompilation(
      compilation('d2', [entity('Hybrid Retrieval', '混合检索', 'd2', { aliases: ['双路召回'] })]),
    );

    const entities = db
      .prepare(`SELECT id, name, aliases FROM knowledge_entities`)
      .all() as Array<{ id: string; name: string; aliases: string }>;
    expect(entities).toHaveLength(1);
    // 首见名保持不变
    expect(entities[0]!.name).toBe('混合检索');
    const aliases = JSON.parse(entities[0]!.aliases) as string[];
    expect(aliases).toEqual(expect.arrayContaining(['Hybrid Retrieval', '双路召回']));

    const docs = db
      .prepare(
        `SELECT DISTINCT document_id AS docId FROM knowledge_entity_mentions ORDER BY docId`,
      )
      .all() as Array<{ docId: string }>;
    expect(docs.map((d) => d.docId)).toEqual(['d1', 'd2']);
  });

  it('重编译后消失的实体被清扫；仍被其他文档引用的实体保留', () => {
    const write = createCompileWriteRepository(db);
    // d1 首编有 A、B
    write.saveCompilation(
      compilation('d1', [entity('实体A', 'a', 'd1'), entity('实体B', 'b', 'd1')]),
    );
    // d2 编译有 B（B 被两文档引用）
    write.saveCompilation(compilation('d2', [entity('实体B', 'b', 'd2')]));
    // d1 重编只剩 A
    write.saveCompilation(compilation('d1', [entity('实体A', 'a', 'd1')]));

    const names = (
      db
        .prepare(`SELECT normalized_name AS n FROM knowledge_entities ORDER BY n`)
        .all() as Array<{ n: string }>
    ).map((x) => x.n);
    expect(names).toEqual(['a', 'b']);
    const bCount = (
      db
        .prepare(`SELECT mention_count AS n FROM knowledge_entities WHERE normalized_name='b'`)
        .get() as { n: number }
    ).n;
    expect(bCount).toBe(1);
  });

  it('事务中途失败整体回滚：缺文档抛错且既有产物不变', () => {
    const write = createCompileWriteRepository(db);
    write.saveCompilation(compilation('d1', [entity('实体A', 'a', 'd1')]));

    expect(() =>
      write.saveCompilation(compilation('missing', [entity('X', 'x', 'missing')])),
    ).toThrow(/not found/);

    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM document_summaries`).get() as { n: number }).n,
    ).toBe(1);
    const gen = (
      db.prepare(`SELECT compile_generation AS n FROM documents WHERE id='d1'`).get() as {
        n: number;
      }
    ).n;
    expect(gen).toBe(1);
  });

  it('updateCompileStatus：failed 携带错误信息', () => {
    const write = createCompileWriteRepository(db);
    write.updateCompileStatus('d1', 'failed', { error: '抽取失败' });
    const row = db
      .prepare(`SELECT compile_status AS s, compile_error AS e FROM documents WHERE id='d1'`)
      .get() as { s: string; e: string };
    expect(row).toEqual({ s: 'failed', e: '抽取失败' });
  });
});

describe('compile-query-repo：实体/摘要查询', () => {
  it('未编译库查询返回空/null 不抛错', () => {
    const db = setupDb();
    const query = createCompileQueryRepository(db);
    expect(query.findEntitiesByNames('kb', ['x'])).toEqual([]);
    expect(query.searchEntityCandidates('kb', ['x'])).toEqual([]);
    expect(query.searchSummaries('kb', ['x'])).toEqual([]);
    expect(query.getDocumentSummary('d1')).toBeNull();
  });

  it('实体精确命中带出处 mention；别名 LIKE 候选可召回；摘要按 key_terms 命中', () => {
    const db = setupDb();
    const write = createCompileWriteRepository(db);
    write.saveCompilation(
      compilation('d1', [
        entity('混合检索', '混合检索', 'd1', {
          aliases: ['Hybrid Retrieval'],
          context: '混合检索融合两路召回。',
        }),
      ]),
    );

    const query = createCompileQueryRepository(db);
    const hits = query.findEntitiesByNames('kb', ['混合检索']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.mentions[0]!.documentName).toBe('d1.txt');
    expect(hits[0]!.mentions[0]!.pageNo).toBe(1);

    const fuzzy = query.searchEntityCandidates('kb', ['hybrid']);
    expect(fuzzy.map((e) => e.normalizedName)).toContain('混合检索');

    const summaries = query.searchSummaries('kb', ['混合检索']);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.keyTerms).toContain('qwen2.5');
    expect(query.getDocumentSummary('d1')!.bullets).toHaveLength(2);
  });
});
