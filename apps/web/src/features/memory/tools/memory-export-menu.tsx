'use client';

import * as React from 'react';
import type { Memory } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  buildMemoriesJson,
  buildMemoriesMarkdown,
  memoryExportFilename,
  type MemoryExportFormat,
} from './memory-export';

function saveText(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** v4.21：记忆导出菜单（Markdown / JSON），只导出当前列表 */
export function MemoryExportMenu({ memories }: { memories: Memory[] }) {
  const { t } = useI18n();
  const [failed, setFailed] = React.useState(false);

  const download = (format: MemoryExportFormat) => {
    setFailed(false);
    try {
      const labels = {
        title: t('memory.exportTitle'),
        exportedAt: t('memory.exportExportedAt'),
        count: t('memory.exportCount'),
        importance: t('memory.exportImportance'),
        confidence: t('memory.exportConfidence'),
        pinned: t('memory.exportPinned'),
        scope: t('memory.exportScope'),
        status: t('memory.exportStatus'),
        subjectKey: t('memory.exportSubjectKey'),
        createdAt: t('memory.exportCreatedAt'),
        lastConfirmedAt: t('memory.exportLastConfirmedAt'),
        yes: t('memory.exportYes'),
        no: t('memory.exportNo'),
      };
      const content =
        format === 'md'
          ? buildMemoriesMarkdown(memories, labels)
          : buildMemoriesJson(memories);
      saveText(
        content,
        memoryExportFilename(format),
        format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      );
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="relative">
      <details data-testid="memory-export">
        <summary className="cursor-pointer list-none rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          {t('memory.export')}
        </summary>
        <div className="absolute right-0 z-10 mt-1 flex w-32 flex-col rounded-md border bg-ui-card p-1 shadow-md">
          <button
            type="button"
            className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
            data-testid="memory-export-markdown"
            onClick={() => download('md')}
          >
            {t('memory.exportMarkdown')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
            data-testid="memory-export-json"
            onClick={() => download('json')}
          >
            {t('memory.exportJson')}
          </button>
        </div>
      </details>
      {failed ? (
        <p className="mt-1 text-xs text-destructive" role="alert" data-testid="memory-export-error">
          {t('memory.exportFailed')}
        </p>
      ) : null}
    </div>
  );
}
