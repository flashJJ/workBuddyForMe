import { describe, expect, it } from 'vitest';
import {
  assemblePagedText,
  assemblePlainText,
  mapChunkCoordinates,
  type StructuredText,
} from './text-structure';

describe('assemblePagedText（PDF 页/段结构）', () => {
  it('拼接结果与旧 join 规则一致（过滤空页、页间双换行），并记录真实页码', () => {
    const result = assemblePagedText([
      { pageNo: 1, text: '第一页标题\n第一页正文' },
      { pageNo: 2, text: '' },
      { pageNo: 3, text: '第三页内容' },
    ]);
    expect(result.text).toBe('第一页标题\n第一页正文\n\n第三页内容');
    expect(result.blocks).toEqual([
      { charStart: 0, charEnd: 5, pageNo: 1, paragraphNo: 1 },
      { charStart: 6, charEnd: 11, pageNo: 1, paragraphNo: 2 },
      { charStart: 13, charEnd: 18, pageNo: 3, paragraphNo: 3 },
    ]);
  });

  it('页内空行分段也能识别', () => {
    const result = assemblePagedText([{ pageNo: 1, text: '段一\n\n段二' }]);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({ pageNo: 1, paragraphNo: 1 });
    expect(result.blocks[1]).toMatchObject({ pageNo: 1, paragraphNo: 2 });
    // 块区间内容正确
    expect(result.text.slice(result.blocks[1]!.charStart, result.blocks[1]!.charEnd)).toBe('段二');
  });

  it('全空白页文档返回空文本无块', () => {
    expect(assemblePagedText([{ pageNo: 1, text: '   ' }])).toEqual({ text: '', blocks: [] });
  });
});

describe('assemblePlainText（非 PDF 段落结构）', () => {
  it('CRLF 归一化、trim，按空行拆连续段落（无页码）', () => {
    const result = assemblePlainText('\r\n第一段\r\n\r\n第二段\r\n');
    expect(result.text).toBe('第一段\n\n第二段');
    expect(result.blocks).toEqual([
      { charStart: 0, charEnd: 3, pageNo: null, paragraphNo: 1 },
      { charStart: 5, charEnd: 8, pageNo: null, paragraphNo: 2 },
    ]);
  });

  it('空文本安全', () => {
    expect(assemblePlainText('  \n ')).toEqual({ text: '', blocks: [] });
  });
});

describe('mapChunkCoordinates（分片→页/段坐标）', () => {
  // text: '第一页标题\n第一页正文\n\n第三页内容'
  const paged: StructuredText = assemblePagedText([
    { pageNo: 1, text: '第一页标题\n第一页正文' },
    { pageNo: 3, text: '第三页内容' },
  ]);

  it('分片落在页 1 首页段/正文段分别映射，页码取起始页', () => {
    const coords = mapChunkCoordinates([{ charStart: 0 }, { charStart: 6 }], paged.blocks);
    expect(coords).toEqual([
      { pageNo: 1, paragraphNo: 1 },
      { pageNo: 1, paragraphNo: 2 },
    ]);
  });

  it('跨页分片取首字符所在页（第 3 页）', () => {
    const coords = mapChunkCoordinates([{ charStart: 13 }], paged.blocks);
    expect(coords[0]).toEqual({ pageNo: 3, paragraphNo: 3 });
  });

  it('首字符落在页连接符间隙时回退前一个块', () => {
    // charStart=11 是第二页正文结束、12 是 \n
    const coords = mapChunkCoordinates([{ charStart: 12 }], paged.blocks);
    expect(coords[0]).toEqual({ pageNo: 1, paragraphNo: 2 });
  });

  it('无块时坐标为 null（不抛错）', () => {
    expect(mapChunkCoordinates([{ charStart: 0 }], [])).toEqual([
      { pageNo: null, paragraphNo: null },
    ]);
  });

  it('非 PDF 文本：页码恒 null，段落正确', () => {
    const plain = assemblePlainText('段落A\n\n段落B');
    // '段落A' 占 0-2，'\n\n' 在 3-4，第二段从 5 开始
    expect(mapChunkCoordinates([{ charStart: 0 }, { charStart: 5 }], plain.blocks)).toEqual([
      { pageNo: null, paragraphNo: 1 },
      { pageNo: null, paragraphNo: 2 },
    ]);
  });
});
