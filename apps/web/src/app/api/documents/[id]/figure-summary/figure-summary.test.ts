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
import { POST as summarizeFigure } from './route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/api/documents/d1/figure-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const paramCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('图注视觉解读路由（v2.19 M4）', () => {
  let db: DatabaseInstance;
  let documentId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-figure-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());

    const kb = createKnowledgeRepository(db).create({
      name: '报告库',
      chunkSize: 500,
      chunkOverlap: 80,
    });
    documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'report.pdf',
      fileType: '.pdf',
      byteSize: 1,
      contentHash: 'h-report',
    }).id;
    createDocumentBlockRepository(db).bulkInsert(documentId, [
      {
        kind: 'heading',
        pageNo: 1,
        sectionPath: ['营收'],
        content: '营收',
        charStart: 0,
        charEnd: 2,
      },
      {
        kind: 'figure',
        pageNo: 2,
        sectionPath: ['营收'],
        content: '图 1 季度营收趋势',
        charStart: 4,
        charEnd: 16,
      },
    ]);
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('未配置视觉模型：422 明确说明原因', async () => {
    const response = await summarizeFigure(jsonRequest({ blockId: 'b2' }), paramCtx(documentId));
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.message).toContain('未配置视觉模型');
  });

  it('非法块 id 与未知文档被拒绝', async () => {
    const invalid = await summarizeFigure(jsonRequest({ blockId: 'x2' }), paramCtx(documentId));
    expect(invalid.status).toBe(422);

    const missing = await summarizeFigure(jsonRequest({ blockId: 'b2' }), paramCtx('missing'));
    expect(missing.status).toBe(404);
  });
});
