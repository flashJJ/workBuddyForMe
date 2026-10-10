import { describe, expect, it } from 'vitest';
import { formatContextBlock, toCitations, type CitableEntry } from './context-formatter';

/**
 * v1.3 M3 T3.1：引用序列化契约——页/段/字符坐标与 staticKind 全量透传，
 * 静态条目缺省字符区间时不出该键（向后兼容旧消费端）。
 */
describe('toCitations 坐标与静态层透传', () => {
  it('普通分片：坐标全量带出，staticKind=chunk，编号按位置', () => {
    const entries: CitableEntry[] = [
      {
        documentId: 'd1',
        documentName: 'spec.pdf',
        content: '分片正文',
        sourceUrl: null,
        pageNo: 2,
        paragraphNo: 5,
        charStart: 100,
        charEnd: 180,
        staticKind: 'chunk',
      },
    ];
    const citations = toCitations(entries);
    expect(citations[0]).toMatchObject({
      documentId: 'd1',
      documentName: 'spec.pdf',
      ordinal: 0,
      pageNo: 2,
      paragraphNo: 5,
      charStart: 100,
      charEnd: 180,
      staticKind: 'chunk',
    });
  });

  it('静态实体条目：staticKind=entity，无字符区间则缺省该两键，页段仍保留', () => {
    const citations = toCitations([
      {
        documentId: 'd1',
        documentName: 'spec.pdf',
        content: 'Qwen2.5 兼容 OpenAI 接口。',
        pageNo: 3,
        paragraphNo: 4,
        staticKind: 'entity',
      },
    ]);
    expect(citations[0]!.staticKind).toBe('entity');
    expect(citations[0]!.pageNo).toBe(3);
    expect('charStart' in citations[0]!).toBe(false);
    expect('charEnd' in citations[0]!).toBe(false);
  });

  it('未标 staticKind 的旧形态条目回落 chunk', () => {
    const citations = toCitations([
      { documentId: 'd9', documentName: 'old.txt', content: 'x' },
    ]);
    expect(citations[0]!.staticKind).toBe('chunk');
  });

  it('快照：静态置顶 + 普通分片的混合序列化形态稳定', () => {
    const citations = toCitations([
      { documentId: 'd1', documentName: 'a.pdf', content: '实体原句', pageNo: 1, paragraphNo: 1, staticKind: 'entity' },
      { documentId: 'd1', documentName: 'a.pdf', content: '文档要点', pageNo: null, paragraphNo: null, staticKind: 'summary' },
      { documentId: 'd2', documentName: 'b.txt', content: '分片正文', staticKind: 'chunk' },
    ]);
    expect(citations.map((c) => [c.ordinal, c.staticKind])).toEqual([
      [0, 'entity'],
      [1, 'summary'],
      [2, 'chunk'],
    ]);

    const block = formatContextBlock([
      { documentName: 'a.pdf', ordinal: 0, content: '实体原句', staticKind: 'entity' },
      { documentName: 'a.pdf', ordinal: 0, content: '文档要点', staticKind: 'summary' },
      { documentName: 'b.txt', ordinal: 0, content: '分片正文', staticKind: 'chunk' },
    ]);
    expect(block).toContain('[1] 实体知识：《a.pdf》');
    expect(block).toContain('[2] 文档要点：《a.pdf》');
    expect(block).toContain('[3] 来源：《b.txt》片段 1');
  });
});
