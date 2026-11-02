import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createDocumentBlockRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as compareDocs } from './route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/api/documents/compare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('文档对比路由（v2.19 M3）', () => {
  let db: DatabaseInstance;
  let leftId: string;
  let rightId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-compare-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());

    const kb = createKnowledgeRepository(db).create({
      name: '合同库',
      chunkSize: 500,
      chunkOverlap: 80,
    });
    const documents = createDocumentRepository(db);
    leftId = documents.create({
      knowledgeBaseId: kb.id,
      filename: '采购合同.md',
      fileType: '.md',
      byteSize: 1,
      contentHash: 'h-left',
    }).id;
    rightId = documents.create({
      knowledgeBaseId: kb.id,
      filename: '销售合同.md',
      fileType: '.md',
      byteSize: 1,
      contentHash: 'h-right',
    }).id;

    const blocks = createDocumentBlockRepository(db);
    blocks.bulkInsert(leftId, [
      {
        kind: 'heading',
        pageNo: 1,
        sectionPath: ['合同'],
        content: '合同',
        charStart: 0,
        charEnd: 2,
      },
      {
        kind: 'table',
        pageNo: 1,
        sectionPath: ['合同', '付款条款'],
        content: '| 阶段 | 比例 |',
        charStart: 4,
        charEnd: 12,
        table: { tableNo: 1, header: ['阶段', '比例'], rows: [['首付', '30%']] },
      },
    ]);
    blocks.bulkInsert(rightId, [
      {
        kind: 'heading',
        pageNo: 1,
        sectionPath: ['合同'],
        content: '合同',
        charStart: 0,
        charEnd: 2,
      },
      {
        kind: 'table',
        pageNo: 1,
        sectionPath: ['合同', '交付'],
        content: '| 阶段 | 比例 |',
        charStart: 4,
        charEnd: 12,
        table: { tableNo: 1, header: ['阶段', '比例'], rows: [['尾款', '70%']] },
      },
    ]);
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('生成 HTML 对比产物并返回统计', async () => {
    const response = await compareDocs(
      jsonRequest({
        leftDocumentId: leftId,
        rightDocumentId: rightId,
        format: 'html',
        locale: 'zh',
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()).data;
    expect(payload.summary.sections).toEqual({ total: 3, shared: 1, leftOnly: 1, rightOnly: 1 });
    expect(payload.summary.tables).toEqual({ left: 1, right: 1, matched: 1 });
    expect(payload.artifact.format).toBe('html');
    expect(payload.artifact.title).toContain('文档对比');
    expect(payload.content).toContain('采购合同.md vs 销售合同.md');
    expect(payload.content).toContain('仅左侧的行：<code>首付</code>');
    expect(payload.filename).toBe('采购合同-vs-销售合同.html');
  });

  it('Markdown 产物与英文 locale', async () => {
    const response = await compareDocs(
      jsonRequest({
        leftDocumentId: leftId,
        rightDocumentId: rightId,
        format: 'md',
        locale: 'en',
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()).data;
    expect(payload.artifact.format).toBe('md');
    expect(payload.content).toContain('Document comparison');
    expect(payload.content).toContain('Section comparison');
  });

  it('同一文档或未知文档被拒绝', async () => {
    const same = await compareDocs(
      jsonRequest({ leftDocumentId: leftId, rightDocumentId: leftId, format: 'html' }),
    );
    expect(same.status).toBe(422);

    const missing = await compareDocs(
      jsonRequest({ leftDocumentId: leftId, rightDocumentId: 'missing', format: 'html' }),
    );
    expect(missing.status).toBe(404);
  });
});
