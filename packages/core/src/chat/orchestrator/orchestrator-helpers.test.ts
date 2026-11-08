import { describe, expect, it } from 'vitest';
import type { Citation } from '@wbfm/shared/types';
import { mergeCitations } from './orchestrator-helpers';

/** v2.27：引用合并契约——去重键统一、snippet 取更完整者、citeIndex 连续唯一 */
function cite(overrides: Partial<Citation> = {}): Citation {
  return {
    documentId: 'd1',
    documentName: '手册.pdf',
    ordinal: 0,
    snippet: '片段',
    staticKind: 'chunk',
    sourceUrl: null,
    ...overrides,
  };
}

describe('mergeCitations（v2.27）', () => {
  it('追加新引用并按列表顺序重编 citeIndex（从 1）', () => {
    const merged = mergeCitations([cite({ citeIndex: 1 })], [
      cite({ documentId: 'd2', documentName: 'b.txt', citeIndex: 9 }),
    ]);
    expect(merged.map((c) => c.citeIndex)).toEqual([1, 2]);
    expect(merged.map((c) => c.documentId)).toEqual(['d1', 'd2']);
  });

  it('同键引用保留首条并取更完整的 snippet', () => {
    const merged = mergeCitations(
      [cite({ snippet: '短' })],
      [cite({ ordinal: 0, snippet: '更完整的片段内容' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.snippet).toBe('更完整的片段内容');
    expect(merged[0]!.citeIndex).toBe(1);
  });

  it('同文档同序号但表格坐标或网页地址不同视为不同来源', () => {
    const merged = mergeCitations(
      [cite({ tableNo: 1, tableRow: 2 })],
      [
        cite({ tableNo: 2, tableRow: 2 }),
        cite({ sourceUrl: 'https://a.com/x', documentId: 'https://a.com/x' }),
      ],
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((c) => c.citeIndex)).toEqual([1, 2, 3]);
  });

  it('无新增引用时原样返回，不重复编号', () => {
    const existing = [cite({ citeIndex: 1 }), cite({ documentId: 'd2', citeIndex: 2 })];
    expect(mergeCitations(existing, undefined)).toBe(existing);
    expect(mergeCitations(existing, [])).toBe(existing);
  });

  it('网页结果同 URL 多次搜索只保留一条', () => {
    const merged = mergeCitations(
      [cite({ documentId: 'https://a.com', documentName: 'A', sourceUrl: 'https://a.com' })],
      [cite({ documentId: 'https://a.com', documentName: 'A', sourceUrl: 'https://a.com' })],
    );
    expect(merged).toHaveLength(1);
  });
});
