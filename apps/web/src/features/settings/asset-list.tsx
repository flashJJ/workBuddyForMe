'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';

/**
 * 已导入资源列表的通用外壳（VRM 模型 / 待机动作共用）。
 *
 * 只负责「卡片 + 标题行 + loading/空态 + 行布局」，查询、删除 mutation 与行内操作
 * 仍留在各自调用方（两者差异较大：待机动作额外有轮播设置、设为待机、当前态徽标）。
 */

/** 单行内容；primary/secondary 为两行文本，actions 为右侧操作区 */
export interface AssetListRow {
  key: string;
  testId?: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface AssetListProps {
  sectionTitleKey: MessageKey;
  emptyKey: MessageKey;
  testId: string;
  isLoading: boolean;
  rows: AssetListRow[];
  /** 标题行右侧附加内容 */
  headerExtra?: React.ReactNode;
  /** 列表上方附加内容（如待机轮播设置） */
  beforeList?: React.ReactNode;
}

export function AssetList({
  sectionTitleKey,
  emptyKey,
  testId,
  isLoading,
  rows,
  headerExtra,
  beforeList,
}: AssetListProps) {
  const { t } = useI18n();

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t(sectionTitleKey)}</h4>
        {headerExtra}
      </div>

      {beforeList}

      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">{t(emptyKey)}</p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between rounded border p-2 text-xs"
              data-testid={row.testId}
            >
              <div>
                <div className="font-medium">{row.primary}</div>
                {row.secondary && <div className="text-muted-foreground">{row.secondary}</div>}
              </div>
              {row.actions && <div className="flex items-center gap-2">{row.actions}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
