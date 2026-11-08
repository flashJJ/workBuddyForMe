import { describe, expect, it } from 'vitest';
import { chunkDocument, sectionPrefix } from './chunk-structured';
import { parseTextDocument } from './text-parser';

const tableDoc = `# 合同

## 付款条款

本合同付款分阶段执行。

| 阶段 | 比例 |
| --- | --- |
| 首付 | 30% |
| 尾款 | 70% |
`;

describe('v2.19 M2 结构感知分块', () => {
  it('表格原子化：普通分片不切断表格，表号/行范围/章节路径入库', () => {
    const parsed = parseTextDocument(tableDoc);
    const chunks = chunkDocument(parsed, { chunkSize: 120, chunkOverlap: 10 });
    const tableChunks = chunks.filter((chunk) => chunk.blockKind === 'table');
    expect(tableChunks).toHaveLength(1);
    expect(tableChunks[0]!.content).toContain('| 阶段 | 比例 |');
    expect(tableChunks[0]!.content).toContain('| 首付 | 30% |');
    expect(tableChunks[0]!.content).toContain('| 尾款 | 70% |');
    expect(tableChunks[0]!.tableNo).toBe(1);
    expect(tableChunks[0]!.tableRowStart).toBe(1);
    expect(tableChunks[0]!.tableRowEnd).toBe(2);
    expect(tableChunks[0]!.sectionPath).toEqual(['合同', '付款条款']);
    expect(tableChunks[0]!.content.startsWith('[合同 › 付款条款]')).toBe(true);
  });

  it('超长表格按数据行切分：每片重复表头，行范围连续且不重叠', () => {
    const rows = Array.from({ length: 30 }, (_, index) => `| 项目${index + 1} | ${index + 1}% |`);
    const parsed = parseTextDocument(
      `# 报价单\n\n| 项目 | 比例 |\n| --- | --- |\n${rows.join('\n')}\n`,
    );
    const chunks = chunkDocument(parsed, { chunkSize: 80, chunkOverlap: 0 });
    const tableChunks = chunks.filter((chunk) => chunk.blockKind === 'table');
    expect(tableChunks.length).toBeGreaterThan(1);
    expect(tableChunks.every((chunk) => chunk.content.includes('| 项目 | 比例 |'))).toBe(true);

    const ranges = tableChunks.map((chunk) => [chunk.tableRowStart, chunk.tableRowEnd]);
    expect(ranges[0]![0]).toBe(1);
    expect(ranges[ranges.length - 1]![1]).toBe(30);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]![0]).toBe(ranges[index - 1]![1]! + 1);
    }
    for (const chunk of tableChunks) {
      expect(
        chunk.content.split('\n').filter((line) => line === '| 项目 | 比例 |'),
      ).toHaveLength(1);
    }
  });

  it('章节前缀 ≤80 字符，章节路径保留完整层级；无章节时无前缀', () => {
    const long = '非常长的章节标题'.repeat(20);
    expect(sectionPrefix(['A', 'B'])).toBe('[A › B]');
    expect(sectionPrefix([long])!.length).toBeLessThanOrEqual(80);
    expect(sectionPrefix([])).toBe('');

    const parsed = parseTextDocument(`# 合同\n\n## 付款条款\n\n正文内容足够长用于分片。`);
    const chunks = chunkDocument(parsed, { chunkSize: 200, chunkOverlap: 0 });
    const body = chunks.find((chunk) => chunk.content.includes('正文内容足够长'))!;
    expect(body.sectionPath).toEqual(['合同', '付款条款']);
    expect(body.content.startsWith('[合同 › 付款条款]')).toBe(true);
  });

  it('低置信表格降级为普通文本：不写表号/行号，内容仍可检索', () => {
    const parsed = parseTextDocument(tableDoc);
    parsed.tables[0]!.confidence = 0.55;
    const chunks = chunkDocument(parsed, { chunkSize: 120, chunkOverlap: 10 });
    const tableChunk = chunks.find((chunk) => chunk.content.includes('| 首付 | 30% |'))!;
    expect(tableChunk.blockKind).toBe('paragraph');
    expect(tableChunk.tableNo).toBeNull();
    expect(tableChunk.tableRowStart).toBeNull();
    expect(tableChunk.tableRowEnd).toBeNull();
    expect(tableChunk.sectionPath).toEqual(['合同', '付款条款']);
  });

  it('普通分片坐标仍可回溯原文，分片拼接不丢段落', () => {
    const parsed = parseTextDocument(`第一段。\n\n第二段。\n\n第三段。`);
    const chunks = chunkDocument(parsed, { chunkSize: 50, chunkOverlap: 0 });
    for (const chunk of chunks) {
      expect(chunk.charStart).toBeGreaterThanOrEqual(0);
      expect(chunk.charEnd).toBeLessThanOrEqual(parsed.text.length);
    }
    expect(chunks.map((chunk) => chunk.content).join('')).toContain('第三段');
  });
});
