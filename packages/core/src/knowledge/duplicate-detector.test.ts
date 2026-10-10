import { describe, expect, it } from 'vitest';
import { detectDuplicatePairs, normalizeDocumentTitle, type ChunkNeighborHit, type DuplicateDoc } from './duplicate-detector';

describe('normalizeDocumentTitle', () => {
  it('去扩展名/复制痕迹/空白标点，NFKC 小写', () => {
    expect(normalizeDocumentTitle('产品手册.pdf')).toBe('产品手册');
    expect(normalizeDocumentTitle('产品手册 (1).PDF')).toBe('产品手册');
    expect(normalizeDocumentTitle('产品手册（2）.docx')).toBe('产品手册');
    expect(normalizeDocumentTitle('Product Spec - Copy.md')).toBe('productspec');
    expect(normalizeDocumentTitle('报告_副本.txt')).toBe('报告');
  });

  it('版本号等正常命名不被误伤；短名返回空串', () => {
    expect(normalizeDocumentTitle('qwen2.5 规格')).toBe('qwen25规格');
    expect(normalizeDocumentTitle('a.bak')).toBe('a');
  });
});

describe('detectDuplicatePairs', () => {
  const docs: DuplicateDoc[] = [
    { documentId: 'd1', filename: '产品手册.pdf' },
    { documentId: 'd2', filename: '产品手册 (1).pdf' },
    { documentId: 'd3', filename: '无关文档.txt' },
  ];

  it('标题归一化命中 → title 建议，不删除只返回', () => {
    const pairs = detectDuplicatePairs(docs, []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reasons).toEqual(['title']);
    expect([pairs[0]!.documentA.documentId, pairs[0]!.documentB.documentId]).toEqual(['d1', 'd2']);
  });

  it('跨文档近邻片对 ≥2 → content 建议，同文档命中忽略，片对去重', () => {
    const hits: ChunkNeighborHit[] = [
      { sourceChunkId: 1, sourceDocumentId: 'd1', neighborChunkId: 10, neighborDocumentId: 'd3', similarity: 0.97 },
      { sourceChunkId: 2, sourceDocumentId: 'd1', neighborChunkId: 11, neighborDocumentId: 'd3', similarity: 0.95 },
      { sourceChunkId: 3, sourceDocumentId: 'd1', neighborChunkId: 4, neighborDocumentId: 'd1', similarity: 0.99 },
      { sourceChunkId: 10, sourceDocumentId: 'd3', neighborChunkId: 1, neighborDocumentId: 'd1', similarity: 0.97 },
    ];
    const pairs = detectDuplicatePairs(docs, hits);
    const content = pairs.find((p) => p.reasons.includes('content'));
    expect(content).toBeDefined();
    expect(content!.matchedChunks).toBe(2);
    expect(content!.maxSimilarity).toBeCloseTo(0.97, 5);
  });

  it('近邻片对不足阈值不建议；title+content 合并两 reason', () => {
    const onlyOne: ChunkNeighborHit[] = [
      { sourceChunkId: 1, sourceDocumentId: 'd1', neighborChunkId: 10, neighborDocumentId: 'd3', similarity: 0.99 },
    ];
    expect(detectDuplicatePairs(docs, onlyOne).some((p) => p.reasons.includes('content'))).toBe(false);

    const twoHits: ChunkNeighborHit[] = [
      { sourceChunkId: 1, sourceDocumentId: 'd1', neighborChunkId: 10, neighborDocumentId: 'd2', similarity: 0.99 },
      { sourceChunkId: 2, sourceDocumentId: 'd1', neighborChunkId: 11, neighborDocumentId: 'd2', similarity: 0.98 },
    ];
    const merged = detectDuplicatePairs(docs, twoHits)[0]!;
    expect(merged.reasons.sort()).toEqual(['content', 'title']);
    expect(merged.matchedChunks).toBe(2);
  });

  it('空输入安全且输出确定排序', () => {
    expect(detectDuplicatePairs([], [])).toEqual([]);
  });
});
