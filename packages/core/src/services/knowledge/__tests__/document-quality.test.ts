import { describe, expect, it } from 'vitest';
import { buildDocumentQualityFacts } from '../document-quality';

const paragraph = { kind: 'paragraph' as const };
const heading = { kind: 'heading' as const };

describe('buildDocumentQualityFacts（v2.29 P0）', () => {
  it('版本落后且缺原始文件：待重建、不可重建、标记两类事实', () => {
    const facts = buildDocumentQualityFacts({
      parseVersion: 0,
      sourceRetained: false,
      ocrStatus: null,
      blocks: [paragraph],
    });
    expect(facts.pendingReparse).toBe(true);
    expect(facts.unrebuildable).toBe(true);
    expect(facts.flags).toEqual(['legacy-parse', 'missing-source', 'no-heading']);
  });

  it('无结构块：待重建，且不重复标记无标题', () => {
    const facts = buildDocumentQualityFacts({
      parseVersion: 1,
      sourceRetained: true,
      ocrStatus: null,
      blocks: [],
    });
    expect(facts.pendingReparse).toBe(true);
    expect(facts.unrebuildable).toBe(false);
    expect(facts.flags).toEqual(['empty-structure']);
  });

  it('已有结构与标题、版本一致：不待重建', () => {
    const facts = buildDocumentQualityFacts({
      parseVersion: 1,
      sourceRetained: true,
      ocrStatus: null,
      blocks: [heading, paragraph],
    });
    expect(facts.pendingReparse).toBe(false);
    expect(facts.flags).toEqual([]);
  });

  it('OCR 与低置信表格：保留表号，供结构面板定位', () => {
    const facts = buildDocumentQualityFacts({
      parseVersion: 1,
      sourceRetained: true,
      ocrStatus: 'done',
      blocks: [
        heading,
        { kind: 'table', table: { tableNo: 2, confidence: 0.55 } },
        { kind: 'table', table: { tableNo: 3, confidence: 0.9 } },
      ],
    });
    expect(facts.flags).toEqual(['ocr-derived', 'low-confidence-table']);
    expect(facts.lowConfidenceTables).toEqual([2]);
  });
});
