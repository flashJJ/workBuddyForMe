import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { readDocx, docxHtmlToText } from './read-docx';
import { readXlsx } from './read-xlsx';
import { readPptx, slideXmlToText } from './read-pptx';

function zipEntry(path: string, content: string): Uint8Array {
  return zipSync({ [path]: new TextEncoder().encode(content) });
}

describe('Office 解析器（M2）', () => {
  it('docx：段落与表格按行提取，单元格 | 分隔', async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>会议纪要</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>方案</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>总价</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>A 方案</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>42 万</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;
    const text = await readDocx(zipEntry('word/document.xml', documentXml));

    expect(text).toContain('会议纪要');
    expect(text).toContain('方案 | 总价');
    expect(text).toContain('A 方案 | 42 万');
  });

  it('docxHtmlToText：标题/换行/实体转义正确', () => {
    expect(
      docxHtmlToText('<p>a &amp; b</p><table><tr><td><p>x</p></td><td><p>y</p></td></tr></table>'),
    ).toBe('a & b\nx | y');
  });

  it('docx：非 zip 垃圾数据抛可读校验错误', async () => {
    await expect(readDocx(new TextEncoder().encode('not a zip'))).rejects.toThrowError(
      /docx 文档解析失败/,
    );
  });

  it('xlsx：多 sheet 分节、单元格按行 tab 拼接、空 sheet 跳过', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['方案', '总价'],
        ['A 方案', 420000],
      ]),
      '报价单',
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([] as string[][]), '空表');

    const data = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
    const text = readXlsx(data);

    expect(text).toContain('## 报价单');
    expect(text).toContain('方案\t总价');
    expect(text).toContain('A 方案\t420000');
    expect(text).not.toContain('空表');
  });

  it('xlsx：损坏数据（非工作簿 zip）抛校验错误', () => {
    const bogusZip = zipSync({ 'hello.txt': new TextEncoder().encode('not a workbook') });
    expect(() => readXlsx(bogusZip)).toThrowError(/xlsx 文档解析失败/);
  });

  it('pptx：slideXmlToText 段内文本节点拼接、段落换行', () => {
    const xml =
      '<p:a><a:p><a:r><a:t>第一</a:t></a:r><a:r><a:t>页标题</a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>第二行 &amp; 收尾</a:t></a:r></a:p></p:a>';
    expect(slideXmlToText(xml)).toBe('第一页标题\n第二行 & 收尾');
  });

  it('pptx：按 slide 序号分节排序（slide10 不排在 slide2 前）', () => {
    const entries: Record<string, Uint8Array> = {};
    const mkSlide = (text: string) =>
      new TextEncoder().encode(
        `<p:a xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:a>`,
      );
    for (const n of [1, 2, 10]) entries[`ppt/slides/slide${n}.xml`] = mkSlide(`第${n}页`);
    const text = readPptx(zipSync(entries));

    expect(text.indexOf('## 第 1 页')).toBeLessThan(text.indexOf('## 第 2 页'));
    expect(text.indexOf('## 第 2 页')).toBeLessThan(text.indexOf('## 第 10 页'));
    expect(text).toContain('第10页');
  });

  it('pptx：无 slide 条目抛可读错误', () => {
    expect(() => readPptx(zipEntry('docProps/app.xml', '<x/>'))).toThrowError(
      /未找到任何幻灯片/,
    );
  });
});
