import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { parseDocumentStructure } from './index';
import { parseTextDocument } from './text-parser';

const encoder = new TextEncoder();

describe('parseDocumentStructure 按扩展名分派', () => {
  it('txt/md：文本结构，无标题时给出降级告警', async () => {
    const txt = await parseDocumentStructure('notes.txt', encoder.encode('第一段\n\n第二段'));
    expect(txt.blocks.map((block) => block.kind)).toEqual(['paragraph', 'paragraph']);
    expect(txt.warnings.join('')).toContain('未检测到标题结构');

    const md = await parseDocumentStructure(
      'notes.md',
      encoder.encode('# 标题\n\n正文\n\n- 条目一\n- 条目二'),
    );
    expect(md.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list']);
  });

  it('docx：解包后识别标题/段落/表格', async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>项目周报</w:t></w:r></w:p>
  <w:p><w:r><w:t>本周完成需求评审。</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>事项</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>负责人</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>联调</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>张三</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
</w:body></w:document>`;
    const parsed = await parseDocumentStructure(
      'report.docx',
      zipSync({ 'word/document.xml': encoder.encode(documentXml) }),
    );
    expect(parsed.blocks.some((block) => block.kind === 'heading')).toBe(true);
    expect(parsed.tables[0]?.header).toEqual(['事项', '负责人']);
    expect(parsed.text).toContain('本周完成需求评审');
  });

  it('pptx：按页标题成章节；xlsx：工作表成标题与表格', async () => {
    const slides: Record<string, Uint8Array> = {
      'ppt/slides/slide1.xml': encoder.encode(
        '<p:a xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>封面</a:t></a:r></a:p></p:a>',
      ),
    };
    const pptx = await parseDocumentStructure('deck.pptx', zipSync(slides));
    expect(pptx.blocks[0]).toMatchObject({ kind: 'heading', content: '第 1 页' });
    expect(pptx.blocks[1]?.content).toBe('封面');

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['季度', '营收'],
        ['Q3', '800 万'],
      ]),
      '财报',
    );
    const xlsx = await parseDocumentStructure(
      'finance.xlsx',
      new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })),
    );
    expect(xlsx.blocks[0]).toMatchObject({ kind: 'heading', content: '财报' });
    expect(xlsx.tables[0]?.header).toEqual(['季度', '营收']);
  });

  it('空文本明确报错；不支持类型沿用既有校验错误', async () => {
    await expect(parseDocumentStructure('empty.txt', encoder.encode('  '))).rejects.toThrow(
      /内容为空/,
    );
    await expect(parseDocumentStructure('a.rtf', encoder.encode('x'))).rejects.toThrow(
      /不支持的文件类型/,
    );
  });

  it('纯文本解析与旧 assemblePlainText 文本口径一致', () => {
    const parsed = parseTextDocument('段落A\r\n\r\n段落B');
    expect(parsed.text).toBe('段落A\n\n段落B');
    expect(parsed.blocks).toHaveLength(2);
  });
});
