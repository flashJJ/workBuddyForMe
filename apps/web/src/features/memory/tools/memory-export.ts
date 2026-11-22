import type { Memory } from '@wbfm/shared/types';

/** v4.21：记忆导出（Markdown / JSON），白名单字段，不含来源 id、向量与路径 */

export type MemoryExportFormat = 'md' | 'json';

export interface MemoryExportRow {
  kind: string;
  content: string;
  scope: string;
  importance: number;
  status: string;
  pinned: boolean;
  confidence: number;
  subjectKey: string | null;
  createdAt: string;
  lastConfirmedAt: string | null;
}

export interface MemoryExportLabels {
  title: string;
  exportedAt: string;
  count: string;
  importance: string;
  confidence: string;
  pinned: string;
  scope: string;
  status: string;
  subjectKey: string;
  createdAt: string;
  lastConfirmedAt: string;
  yes: string;
  no: string;
}

export function toMemoryExportRow(memory: Memory): MemoryExportRow {
  return {
    kind: memory.kind,
    content: memory.content,
    scope: memory.scope,
    importance: memory.importance,
    status: memory.status,
    pinned: memory.pinned,
    confidence: memory.confidence,
    subjectKey: memory.subjectKey,
    createdAt: memory.createdAt,
    lastConfirmedAt: memory.lastConfirmedAt,
  };
}

export function memoryExportFilename(format: MemoryExportFormat, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `memories-${date}.${format}`;
}

function metaLine(label: string, value: string): string {
  return `- ${label}: ${value}`;
}

export function buildMemoriesMarkdown(
  memories: readonly Memory[],
  labels: MemoryExportLabels,
  exportedAt = new Date(),
): string {
  const rows = memories.map(toMemoryExportRow);
  const lines = [
    `# ${labels.title}`,
    '',
    metaLine(labels.exportedAt, exportedAt.toISOString()),
    metaLine(labels.count, String(rows.length)),
    '',
  ];
  rows.forEach((row, index) => {
    lines.push(`## ${index + 1}. ${row.kind} · ${row.scope} · ${row.status}`);
    lines.push(
      metaLine(
        labels.importance,
        `${row.importance.toFixed(2)} · ${labels.confidence} ${row.confidence.toFixed(2)} · ${labels.pinned} ${
          row.pinned ? labels.yes : labels.no
        }`,
      ),
    );
    if (row.subjectKey) lines.push(metaLine(labels.subjectKey, row.subjectKey));
    lines.push(metaLine(labels.createdAt, row.createdAt));
    if (row.lastConfirmedAt) lines.push(metaLine(labels.lastConfirmedAt, row.lastConfirmedAt));
    lines.push('', row.content, '');
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

export function buildMemoriesJson(
  memories: readonly Memory[],
  exportedAt = new Date(),
): string {
  return `${JSON.stringify(
    {
      version: 1,
      exportedAt: exportedAt.toISOString(),
      memories: memories.map(toMemoryExportRow),
    },
    null,
    2,
  )}\n`;
}
