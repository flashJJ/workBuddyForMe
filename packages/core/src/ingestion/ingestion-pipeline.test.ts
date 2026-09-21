import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChunkRepository,
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  searchChunks,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService } from '../services/settings-service';
import { createIngestionPipeline } from './ingestion-pipeline';

const encoder = new TextEncoder();

describe('文档摄入管线（TR-16.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let documentId: string;
  let kbId: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t16-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const kb = createKnowledgeRepository(db).create({
      name: '测试库',
      chunkSize: 200,
      chunkOverlap: 20,
    });
    kbId = kb.id;
    documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'notes.txt',
      fileType: '.txt',
      byteSize: 10,
      contentHash: 'hash-1',
    }).id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  function seedEmbeddingModel() {
    const providers = createProviderRepository(db);
    const provider = providers.create({
      name: '嵌入供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'embed-test',
      capabilities: ['embedding'],
      contextWindow: null,
    });
    createSettingsService({ db, cipher }).update({ defaultEmbeddingModelId: model.id });
  }

  it('未配置 embedding 模型：直接 failed', async () => {
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode('任意内容'),
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('embedding');
    expect(createDocumentRepository(db).findById(documentId)!.status).toBe('failed');
  });

  it('全链路：解析→分片→嵌入→chunks+vec0 落库，可向量检索', async () => {
    seedEmbeddingModel();
    const content = `${'苹果是红色的水果。'.repeat(14)}\n\n${'香蕉是黄色的水果。'.repeat(14)}`;
    const embeddings = Array.from({ length: 2 }, (_, i) =>
      i === 0 ? [1, 0] : [0, 1],
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: embeddings.map((e, i) => ({ index: i, embedding: e })) }), {
          status: 200,
        }),
    );

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });

    expect(result.status).toBe('indexed');
    expect(result.chunkCount).toBe(2);
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.status).toBe('indexed');
    expect(doc.chunkCount).toBe(2);
    expect(doc.indexedAt).toBeTruthy();
    expect(createChunkRepository(db).countByDocument(documentId)).toBe(2);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('embed-test');
    expect(body.input).toHaveLength(2);

    const kbId = createDocumentRepository(db).findById(documentId)!.knowledgeBaseId;
    const hits = searchChunks(db, { knowledgeBaseId: kbId, vector: [1, 0], k: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content).toContain('苹果');
    expect(hits[0]!.documentName).toBe('notes.txt');
  });

  it('上游嵌入接口 500：文档 failed 且无分片残留', async () => {
    seedEmbeddingModel();
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }));

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode('一些需要嵌入的内容'.repeat(10)),
    });
    expect(result.status).toBe('failed');
    expect(createChunkRepository(db).countByDocument(documentId)).toBe(0);
  });

  it('不支持的文件类型：解析阶段 failed', async () => {
    seedEmbeddingModel();
    createDocumentRepository(db);
    const kb = createKnowledgeRepository(db).list()[0]!;
    const docx = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'notes.rtf',
      fileType: '.rtf',
      byteSize: 1,
      contentHash: 'h2',
    });
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId: docx.id,
      buffer: encoder.encode('x'),
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('不支持的文件类型');
  });

  it('M2：docx/xlsx/pptx 解析后正常分片入库，关键词可被向量检索命中', async () => {
    seedEmbeddingModel();
    // mock 嵌入：所有文本给同一向量，距离相同时检索仍会返回库内分片
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
      return new Response(
        JSON.stringify({ data: body.input.map((_t, i) => ({ index: i, embedding: [1, 0] })) }),
        { status: 200 },
      );
    });

    const docxSentence = '办公座椅采购项目本季度采购人体工学座椅一百把。';
    const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  ${`<w:p><w:r><w:t>${docxSentence}</w:t></w:r></w:p>`.repeat(8)}
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>单价</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>1500 元</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
    const docxBuffer = zipSync({
      'word/document.xml': encoder.encode(docxXml),
    });

    const xlsxSentence = '季度营收八百万元整同比增长两成';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(
        Array.from({ length: 10 }, () => [xlsxSentence, '财年 2026']),
      ),
      '财报',
    );
    const xlsxBuffer = new Uint8Array(
      XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }),
    );

    const pptxSentence = '新品发布会将于下月举行主打智能家居产品线';
    const pptxEntries: Record<string, Uint8Array> = {};
    for (const n of [1, 2]) {
      pptxEntries[`ppt/slides/slide${n}.xml`] = encoder.encode(
        `<p:a xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
          `<a:p><a:r><a:t>${pptxSentence.repeat(5)}</a:t></a:r></a:p></p:a>`,
      );
    }
    const pptxBuffer = zipSync(pptxEntries);

    const pipeline = createIngestionPipeline({ db, cipher });
    const cases = [
      { filename: 'a.docx', fileType: '.docx', hash: 'h-docx', buffer: docxBuffer },
      { filename: 'b.xlsx', fileType: '.xlsx', hash: 'h-xlsx', buffer: xlsxBuffer },
      { filename: 'c.pptx', fileType: '.pptx', hash: 'h-pptx', buffer: pptxBuffer },
    ];
    for (const item of cases) {
      const row = createDocumentRepository(db).create({
        knowledgeBaseId: kbId,
        filename: item.filename,
        fileType: item.fileType,
        byteSize: item.buffer.byteLength,
        contentHash: item.hash,
      });
      const result = await pipeline.ingest({ documentId: row.id, buffer: item.buffer });
      expect(result.status).toBe('indexed');
      expect(result.chunkCount).toBeGreaterThan(0);
    }

    const hits = searchChunks(db, { knowledgeBaseId: kbId, vector: [1, 0], k: 50 })
      .map((hit) => hit.content)
      .join('\n');
    expect(hits).toContain('办公座椅采购项目');
    expect(hits).toContain('季度营收');
    expect(hits).toContain('新品发布会');
    expect(hits).toContain('单价');
  });
});
