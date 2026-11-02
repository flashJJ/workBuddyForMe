import type { ComparisonLabels } from './document-comparison-labels';
import type { DocumentComparisonModel } from './document-comparison-model';

/** v2.19 M3：跨文档对比 HTML 渲染（自包含、无脚本、全部转义） */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function list(items: string[], labels: ComparisonLabels): string {
  if (items.length === 0) return `<span class="muted">${escapeHtml(labels.none)}</span>`;
  return items.map((item) => `<code>${escapeHtml(item)}</code>`).join('、');
}

function status(row: { inLeft: boolean; inRight: boolean }, labels: ComparisonLabels): string {
  if (row.inLeft && row.inRight) return `<span class="ok">${escapeHtml(labels.shared)}</span>`;
  if (row.inLeft) return `<span class="warn">${escapeHtml(labels.leftOnly)}</span>`;
  return `<span class="warn">${escapeHtml(labels.rightOnly)}</span>`;
}

export function renderComparisonHtml(
  model: DocumentComparisonModel,
  labels: ComparisonLabels,
  locale: 'zh' | 'en' = 'zh',
): string {
  const leftSections = model.summary.sections.shared + model.summary.sections.leftOnly;
  const rightSections = model.summary.sections.shared + model.summary.sections.rightOnly;
  const sections = model.sectionRows.length
    ? `<table>
  <thead><tr><th>${escapeHtml(labels.section)}</th><th>${escapeHtml(labels.left)}</th><th>${escapeHtml(labels.right)}</th><th>${escapeHtml(labels.status)}</th></tr></thead>
  <tbody>
${model.sectionRows
  .map(
    (row) => `    <tr><td>${escapeHtml(row.path)}</td><td>${row.inLeft ? '✓' : '—'}</td><td>${row.inRight ? '✓' : '—'}</td><td>${status(row, labels)}</td></tr>`,
  )
  .join('\n')}
  </tbody>
</table>`
    : `<p class="muted">${escapeHtml(labels.emptySections)}</p>`;

  const tables = model.tableRows.length
    ? `<table>
  <thead><tr><th>${escapeHtml(labels.tableLeft)}</th><th>${escapeHtml(labels.tableRight)}</th><th>${escapeHtml(labels.header)}</th><th>${escapeHtml(labels.rows)}</th><th>${escapeHtml(labels.rowLabels)}</th></tr></thead>
  <tbody>
${model.tableRows
  .map(
    (row) =>
      `    <tr><td>${escapeHtml(row.leftLabel)}</td><td>${escapeHtml(row.rightLabel)}</td><td>${escapeHtml(row.headerSame ? labels.headerSame : labels.headerDiff)}</td><td>${row.rowsLeft} / ${row.rowsRight}</td><td>${escapeHtml(labels.sharedLabels)} ${row.labelsShared} · ${escapeHtml(labels.leftOnly)} ${row.labelsLeftOnly.length} · ${escapeHtml(labels.rightOnly)} ${row.labelsRightOnly.length}</td></tr>`,
  )
  .join('\n')}
  </tbody>
</table>`
    : `<p class="muted">${escapeHtml(labels.emptyTables)}</p>`;

  const details = model.tableRows
    .map(
      (row) => `<section class="pair">
  <h3>${escapeHtml(row.leftLabel)} ↔ ${escapeHtml(row.rightLabel)}</h3>
  <p>${escapeHtml(labels.header)}：${escapeHtml(row.headerSame ? labels.headerSame : labels.headerDiff)}</p>
  <p>${escapeHtml(labels.leftOnlyRows)}：${list(row.labelsLeftOnly, labels)}</p>
  <p>${escapeHtml(labels.rightOnlyRows)}：${list(row.labelsRightOnly, labels)}</p>
</section>`,
    )
    .join('\n');

  const unmatched =
    model.unmatchedLeft.length || model.unmatchedRight.length
      ? `<h2>${escapeHtml(labels.unmatched)}</h2>
<ul>
${model.unmatchedLeft.length ? `  <li>${escapeHtml(labels.leftOnlyTables)}：${list(model.unmatchedLeft, labels)}</li>` : ''}
${model.unmatchedRight.length ? `  <li>${escapeHtml(labels.rightOnlyTables)}：${list(model.unmatchedRight, labels)}</li>` : ''}
</ul>`
      : '';

  const warnings = model.warnings.length
    ? `<h2>${escapeHtml(labels.warnings)}</h2>
<ul class="warnings">
${model.warnings.map((warning) => `  <li>${escapeHtml(warning)}</li>`).join('\n')}
</ul>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(labels.title)}</title>
<style>
  body { max-width: 960px; margin: 32px auto; padding: 0 20px; color: #1f2937; font: 14px/1.7 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 17px; margin-top: 28px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 14px; margin: 0 0 6px; }
  .meta { color: #6b7280; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; }
  .muted { color: #9ca3af; }
  .ok { color: #047857; }
  .warn { color: #b45309; }
  .pair { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin: 10px 0; background: #fcfcfd; }
  .pair p { margin: 4px 0; }
  code { background: #f3f4f6; border-radius: 4px; padding: 1px 5px; }
  .warnings li { color: #92400e; }
</style>
</head>
<body>
<h1>${escapeHtml(labels.title)}：${escapeHtml(model.left.name)} vs ${escapeHtml(model.right.name)}</h1>
<p class="meta">${escapeHtml(labels.generatedAt)}：${escapeHtml(model.generatedAt)}</p>
<ul>
  <li>${escapeHtml(labels.left)}：${escapeHtml(model.left.name)}（${leftSections} ${escapeHtml(labels.sections)} · ${model.summary.tables.left} ${escapeHtml(labels.tables)}）</li>
  <li>${escapeHtml(labels.right)}：${escapeHtml(model.right.name)}（${rightSections} ${escapeHtml(labels.sections)} · ${model.summary.tables.right} ${escapeHtml(labels.tables)}）</li>
</ul>
<h2>${escapeHtml(labels.sectionCompare)}</h2>
${sections}
<h2>${escapeHtml(labels.tableCompare)}</h2>
${tables}
${details}
${unmatched}
${warnings}
</body>
</html>
`;
}
