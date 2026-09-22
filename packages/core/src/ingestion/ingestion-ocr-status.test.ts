import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService } from '../services/settings-service';
import { createIngestionPipeline } from './ingestion-pipeline';

// OCR 文本提取在 runner/extract 单测中已覆盖，此处只验证管线状态写入
const extractDocumentText = vi.fn();
vi.mock('./extract-with-ocr', () => ({
  extractDocumentText: (...args: unknown[]) => extractDocumentText(...args),
}));

describe('摄入管线 OCR 状态流转（v0.4）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let documentId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-ocr-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
        let count = 1;
        try {
          const body = JSON.parse(init?.body ?? '{}') as { input?: unknown[] };
          count = body.input?.length ?? 1;
        } catch {
          count = 1;
        }
        return new Response(
          JSON.stringify({
            data: Array.from({ length: count }, (_, i) => ({ index: i, embedding: [1, i] })),
          }),
          { status: 200 },
        );
      }),
    );

    const kb = createKnowledgeRepository(db).create({ name: '库', chunkSize: 200, chunkOverlap: 20 });
    const provider = createProviderRepository(db).create({
      name: 'p',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const embedModel = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'emb',
      capabilities: ['embedding'],
      contextWindow: null,
    });
    createSettingsService({ db, cipher }).update({ defaultEmbeddingModelId: embedModel.id });

    documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'scan.pdf',
      fileType: '.pdf',
      byteSize: 10,
      contentHash: 'h',
    }).id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('普通文档（ocr=null）：indexed 且不写 OCR 列', async () => {
    extractDocumentText.mockResolvedValue({ text: '苹果是红色的水果。'.repeat(20), ocr: null });
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: new Uint8Array([1]),
    });
    expect(result.status).toBe('indexed');
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.ocrStatus).toBeNull();
    expect(doc.ocrEngine).toBeNull();
  });

  it('OCR 完整成功：indexed + ocrStatus=done + ocrEngine=vision；开始前曾写 running', async () => {
    const states: Array<string | null> = [];
    extractDocumentText.mockImplementation(async (_d, _f, _b, hooks) => {
      hooks?.onOcrStart?.();
      states.push(createDocumentRepository(db).findById(documentId)!.ocrStatus);
      return { text: '视觉 OCR 文本内容'.repeat(20), ocr: { engine: 'vision', partial: false } };
    });
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: new Uint8Array([1]),
    });
    expect(result.status).toBe('indexed');
    expect(states).toContain('running');
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.ocrStatus).toBe('done');
    expect(doc.ocrEngine).toBe('vision');
  });

  it('OCR 部分成功：状态 partial，文本仍完成索引', async () => {
    extractDocumentText.mockResolvedValue({
      text: '部分页 OCR 文本'.repeat(20),
      ocr: { engine: 'tesseract', partial: true },
    });
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: new Uint8Array([1]),
    });
    expect(result.status).toBe('partial');
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.status).toBe('partial');
    expect(doc.ocrStatus).toBe('done');
    expect(doc.ocrEngine).toBe('tesseract');
    expect(doc.chunkCount).toBeGreaterThan(0);
  });

  it('OCR 失败：failed + ocrStatus=failed + 可读指引', async () => {
    extractDocumentText.mockRejectedValue(
      new Error('扫描件 OCR 失败，请尝试配置支持视觉的模型或使用带文字层的 PDF'),
    );
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: new Uint8Array([1]),
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('OCR');
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.status).toBe('failed');
    expect(doc.ocrStatus).toBe('failed');
  });
});
