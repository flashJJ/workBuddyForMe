import { ARTIFACT_MIME_BY_FORMAT, type ArtifactFormat } from '@wbfm/shared/constants';
import type { DocumentComparisonSummary } from '@wbfm/shared/types';
import { renderComparisonHtml } from './document-comparison-html';
import {
  COMPARISON_LABELS,
  type ComparisonLabels,
} from './document-comparison-labels';
import {
  buildComparisonModel,
  type ComparisonDocumentInput,
  type DocumentComparisonModel,
} from './document-comparison-model';

/** v2.19 M3：跨文档章节/表格对比产物（Markdown/HTML，纯函数） */

export { COMPARISON_LABELS } from './document-comparison-labels';
export type { ComparisonLabels } from './document-comparison-labels';
export type {
  ComparisonDocumentInput,
  ComparisonSectionRow,
  ComparisonTableRow,
  DocumentComparisonModel,
} from './document-comparison-model';

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function renderComparisonMarkdown(
  model: DocumentComparisonModel,
  labels: ComparisonLabels,
): string {
  const leftSections = model.summary.sections.shared + model.summary.sections.leftOnly;
  const rightSections = model.summary.sections.shared + model.summary.sections.rightOnly;
  const lines = [
    `# ${labels.title}：${model.left.name} vs ${model.right.name}`,
    '',
    `- ${labels.generatedAt}：${model.generatedAt}`,
    `- ${labels.left}：${model.left.name}（${leftSections} ${labels.sections} · ${model.summary.tables.left} ${labels.tables}）`,
    `- ${labels.right}：${model.right.name}（${rightSections} ${labels.sections} · ${model.summary.tables.right} ${labels.tables}）`,
    '',
    `## ${labels.sectionCompare}`,
  ];
  if (model.sectionRows.length === 0) {
    lines.push('', labels.emptySections);
  } else {
    lines.push(
      '',
      `| ${labels.section} | ${labels.left} | ${labels.right} | ${labels.status} |`,
      '| --- | --- | --- | --- |',
    );
    for (const row of model.sectionRows) {
      const status = row.inLeft && row.inRight
        ? labels.shared
        : row.inLeft
          ? labels.leftOnly
          : labels.rightOnly;
      lines.push(
        `| ${mdCell(row.path)} | ${row.inLeft ? '✓' : '—'} | ${row.inRight ? '✓' : '—'} | ${status} |`,
      );
    }
  }

  lines.push('', `## ${labels.tableCompare}`);
  if (model.tableRows.length === 0) {
    lines.push('', labels.emptyTables);
  } else {
    lines.push(
      '',
      `| ${labels.tableLeft} | ${labels.tableRight} | ${labels.header} | ${labels.rows} | ${labels.rowLabels} |`,
      '| --- | --- | --- | --- | --- |',
    );
    for (const row of model.tableRows) {
      const diff = `${labels.sharedLabels} ${row.labelsShared} · ${labels.leftOnly} ${row.labelsLeftOnly.length} · ${labels.rightOnly} ${row.labelsRightOnly.length}`;
      lines.push(
        `| ${mdCell(row.leftLabel)} | ${mdCell(row.rightLabel)} | ${row.headerSame ? labels.headerSame : labels.headerDiff} | ${row.rowsLeft}/${row.rowsRight} | ${diff} |`,
      );
    }
    for (const row of model.tableRows) {
      lines.push('', `### ${row.leftLabel} ↔ ${row.rightLabel}`, '');
      lines.push(`- ${labels.header}：${row.headerSame ? labels.headerSame : labels.headerDiff}`);
      lines.push(
        `- ${labels.leftOnlyRows}：${row.labelsLeftOnly.length > 0 ? row.labelsLeftOnly.map(mdCell).join('、') : labels.none}`,
      );
      lines.push(
        `- ${labels.rightOnlyRows}：${row.labelsRightOnly.length > 0 ? row.labelsRightOnly.map(mdCell).join('、') : labels.none}`,
      );
    }
  }

  if (model.unmatchedLeft.length > 0 || model.unmatchedRight.length > 0) {
    lines.push('', `## ${labels.unmatched}`, '');
    if (model.unmatchedLeft.length > 0) {
      lines.push(`- ${labels.leftOnlyTables}：${model.unmatchedLeft.map(mdCell).join('、')}`);
    }
    if (model.unmatchedRight.length > 0) {
      lines.push(`- ${labels.rightOnlyTables}：${model.unmatchedRight.map(mdCell).join('、')}`);
    }
  }

  if (model.warnings.length > 0) {
    lines.push('', `## ${labels.warnings}`, '');
    for (const warning of model.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

function filenamePart(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
  return base || 'doc';
}

export interface DocumentComparisonOptions {
  format: Extract<ArtifactFormat, 'md' | 'html'>;
  locale: 'zh' | 'en';
  generatedAt?: string;
}

export interface DocumentComparisonOutput {
  content: string;
  filename: string;
  mimeType: string;
  summary: DocumentComparisonSummary;
}

/** 生成对比产物正文（Markdown/HTML）；不写文件，由调用方落盘 */
export function buildDocumentComparison(
  left: ComparisonDocumentInput,
  right: ComparisonDocumentInput,
  options: DocumentComparisonOptions,
): DocumentComparisonOutput {
  const labels = COMPARISON_LABELS[options.locale];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const model = buildComparisonModel(left, right, labels, generatedAt);
  const content =
    options.format === 'html'
      ? renderComparisonHtml(model, labels, options.locale)
      : renderComparisonMarkdown(model, labels);
  return {
    content,
    filename: `${filenamePart(left.name)}-vs-${filenamePart(right.name)}.${options.format}`,
    mimeType: ARTIFACT_MIME_BY_FORMAT[options.format],
    summary: model.summary,
  };
}
