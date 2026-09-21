import { ApiError } from '@wbfm/shared';
import * as XLSX from 'xlsx';
import { toOfficeReadError } from './office-error';

/**
 * xlsx → Markdown 风格纯文本：每个 sheet 一节（## Sheet 名），
 * 单元格按行以制表符拼接，空行过滤；完全空白的 sheet 跳过。
 */
export function readXlsx(data: Uint8Array): string {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'array' });
  } catch (error) {
    throw toOfficeReadError('xlsx', error);
  }

  const sections: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
    const lines = rows
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .map((cell) => String(cell ?? '').replace(/\r?\n/g, ' ').trim())
          .join('\t')
          .trimEnd(),
      )
      .filter((line) => line.length > 0);
    if (lines.length > 0) sections.push(`## ${name}\n${lines.join('\n')}`);
  }

  if (sections.length === 0) {
    throw ApiError.validation('xlsx 文档解析失败：工作簿中没有可读取的文本内容');
  }
  return sections.join('\n\n');
}
