import { describe, expect, it } from 'vitest';
import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared/types';
import { mapDocumentHit } from './knowledge-search';

const kb = {
  id: 'kb1',
  name: '产品文档',
  description: '',
  chunkSize: 500,
  chunkOverlap: 80,
  documentCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as KnowledgeBase;

const doc = {
  id: 'd1',
  knowledgeBaseId: 'kb1',
  filename: '青鸟计划.md',
  fileType: '.md',
  byteSize: 10,
  contentHash: 'h1',
  status: 'indexed',
  source: 'upload',
  sourceUrl: null,
  ocrStatus: null,
  ocrEngine: null,
  errorMessage: null,
  chunkCount: 3,
  parseVersion: 1,
  createdAt: '2026-11-22T00:00:00.000Z',
  indexedAt: null,
} as DocumentRecord;

describe('v4.18 知识库文档检索', () => {
  it('文档命中映射为知识域结果并直达所属知识库', () => {
    expect(mapDocumentHit(kb, doc)).toMatchObject({
      domain: 'knowledge',
      id: 'd1',
      title: '青鸟计划.md',
      snippet: '.md · indexed',
      deepLink: '/knowledge?kb=kb1',
    });
  });

  it('来源存在时片段优先显示来源地址', () => {
    expect(
      mapDocumentHit(kb, { ...doc, sourceUrl: 'https://example.com/doc' }).snippet,
    ).toBe('https://example.com/doc');
  });
});
