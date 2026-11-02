'use client';

import * as React from 'react';
import type { DocumentStructureView } from '@wbfm/core/services';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { DocumentViewerFocus } from './types';

type Table = DocumentStructureView['tables'][number];

function parseCellAddress(address?: string): { column: number; row: number } | null {
  const match = address?.trim().toUpperCase().match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  let column = 0;
  for (const char of match[1]!) column = column * 26 + (char.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) };
}

/** 列下标 → Excel 列名（与后端 tableCell 口径一致） */
function columnLetter(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function TableCard({ table, focus }: { table: Table; focus: DocumentViewerFocus | null }) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLElement | null>(null);
  const hasHeader = table.header.length > 0;
  const targeted = focus?.tableNo === table.tableNo;
  const address = targeted ? parseCellAddress(focus?.tableCell) : null;
  const cellRow = address ? (hasHeader ? address.row - 1 : address.row) : null;
  const focusRow = targeted ? cellRow ?? focus?.tableRow ?? null : null;

  React.useEffect(() => {
    if (targeted) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [targeted]);

  return (
    <article
      ref={targeted ? ref : undefined}
      className={`rounded-md border px-3 py-2 ${targeted ? 'border-amber-400 ring-1 ring-amber-300' : ''}`}
      data-testid="structure-table"
      data-table-no={table.tableNo}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium">
          {t('documentViewer.tableNo', { no: String(table.tableNo) })}
        </span>
        {table.caption && <span className="truncate text-xs">{table.caption}</span>}
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {t('documentViewer.tableRows', { count: table.rows.length })}
        </span>
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left font-medium text-muted-foreground">#</th>
              {(hasHeader
                ? table.header
                : Array.from(
                    { length: Math.max(...table.rows.map((row) => row.length), 1) },
                    (_, i) => columnLetter(i),
                  )
              ).map(
                (cell, index) => (
                  <th key={`${cell}-${index}`} className="border px-2 py-1 text-left font-medium">
                    {hasHeader ? cell : `(${index + 1})`}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const rowNo = rowIndex + 1;
              const rowTargeted = focusRow === rowNo;
              const columnCount = Math.max(
                hasHeader ? table.header.length : 0,
                row.length,
                1,
              );
              return (
                <tr
                  key={rowNo}
                  className={rowTargeted ? 'bg-amber-50' : undefined}
                  data-testid={`table-row-${table.tableNo}-${rowNo}`}
                  data-targeted={rowTargeted ? 'true' : undefined}
                >
                  <th className="border bg-muted/40 px-2 py-1 text-left font-normal text-muted-foreground">
                    {rowNo}
                  </th>
                  {Array.from({ length: columnCount }, (_, cellIndex) => {
                    const cellTargeted =
                      targeted &&
                      address?.column === cellIndex &&
                      cellRow === rowNo;
                    const cellLabel = `${columnLetter(cellIndex)}${hasHeader ? rowNo + 1 : rowNo}`;
                    return (
                      <td
                        key={cellIndex}
                        className={`border px-2 py-1 align-top ${
                          cellTargeted ? 'bg-amber-200 font-medium' : ''
                        }`}
                        data-testid={cellTargeted ? `table-cell-${focus?.tableCell}` : undefined}
                        data-cell={cellLabel}
                      >
                        {row[cellIndex] ?? ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function TablePanel({
  tables,
  focus,
}: {
  tables: readonly Table[];
  focus: DocumentViewerFocus | null;
}) {
  const { t } = useI18n();
  return (
    <section data-testid="structure-tables">
      <h3 className="mb-2 font-medium">
        {t('documentViewer.tables')} · {tables.length}
      </h3>
      {tables.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('documentViewer.noTables')}</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">{t('documentViewer.tableNote')}</p>
          <div className="space-y-2">
            {tables.map((table) => (
              <TableCard key={table.tableNo} table={table} focus={focus} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
