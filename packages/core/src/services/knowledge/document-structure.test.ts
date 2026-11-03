import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createDocumentBlockRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createSettingsService } from '../settings/settings-service';
import { createDocumentService } from './document-service';

const encoder = new TextEncoder();

describe('document-service v2.19 结构预览与重建', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let kbId: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-docstructure-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
      return new Response(
        JSON.stringify({ data: body.input.map((_text, index) => ({ index, embedding: [1, 0] })) }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    kbId = createKnowledgeRepository(db).create({ name: '库', chunkSize: 200, chunkOverlap: 10 }).id;
    const provider = createProviderRepository(db).create({
      name: 'p',
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
    createSettingsService({ db, cipher }).update({
      defaultEmbeddingModelId: model.id,
      autoCompile: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('结构预览：章节/表格/页与表格错列警告', () => {
    const service = createDocumentService({ db, cipher });
    const document = service.upload(kbId, {
      filename: 'contract.md',
      buffer: encoder.encode('# 合同\n\n## 付款条款\n\n| 阶段 | 比例 |\n| --- | --- |\n| 首付 | 30% | 超额 |'),
    });
    createDocumentBlockRepository(db).bulkInsert(document.id, [
      {
        kind: 'heading',
        pageNo: 1,
        sectionPath: ['合同'],
        content: '合同',
        charStart: 0,
        charEnd: 2,
      },
      {
        kind: 'heading',
        pageNo: 1,
        sectionPath: ['合同', '付款条款'],
        content: '付款条款',
        charStart: 4,
        charEnd: 8,
      },
      {
        kind: 'table',
        pageNo: 1,
        sectionPath: ['合同', '付款条款'],
        content: '| 阶段 | 比例 |',
        charStart: 10,
        charEnd: 20,
        table: {
          tableNo: 1,
          header: ['阶段', '比例'],
          rows: [['首付', '30%', '超额']],
          pageNo: 1,
        },
      },
    ]);

    const view = service.getStructure(document.id);
    expect(view.structureAvailable).toBe(true);
    expect(view.pages).toEqual([{ pageNo: 1, blockIds: ['b1', 'b2', 'b3'] }]);
    expect(view.sections.map((section) => section.path)).toEqual([
      ['合同'],
      ['合同', '付款条款'],
    ]);
    expect(view.tables[0]?.header).toEqual(['阶段', '比例']);
    expect(view.warnings.join('')).toContain('第 1 行单元格数与表头不一致');
  });

  it('未保留原始文件的旧文档：重建给可读 422，不破坏结构', () => {
    const service = createDocumentService({ db, cipher });
    const document = service.upload(kbId, {
      filename: 'legacy.txt',
      buffer: encoder.encode('旧文档正文'),
    });
    expect(() => service.reparse(document.id)).toThrow(ApiError);
    expect(() => service.reparse(document.id)).toThrow(/原始文件未保留/);
  });

  it('摄入保存原始文件；重建入队；删除文档同步清理源文件', async () => {
    const service = createDocumentService({ db, cipher });
    const buffer = encoder.encode('采购合同付款条款说明。'.repeat(20));
    const document = service.upload(kbId, { filename: 'contract.txt', buffer });
    const result = await service.ingest(document.id, buffer);
    expect(result.status).toBe('indexed');

    const source = join(tempRoot, 'documents', `${document.id}.bin`);
    expect(existsSync(source)).toBe(true);
    expect(new TextDecoder().decode(readFileSync(source))).toContain('采购合同');

    expect(service.reparse(document.id)).toEqual({ queued: true });
    expect(createDocumentRepository(db).findById(document.id)!.status).toBe('processing');
    await vi.waitFor(() => {
      expect(createDocumentRepository(db).findById(document.id)!.status).toBe('indexed');
    });

    service.delete(document.id);
    expect(existsSync(source)).toBe(false);
  });
});
