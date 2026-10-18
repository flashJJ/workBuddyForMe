'use client';

import * as React from 'react';
import {
  DEFAULT_INTERACTION_GRAPH,
  INTERACTION_GRAPH_OVERRIDES_MAX,
  type InteractionGraphEntry,
} from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { InteractionGraphRow } from './interaction-graph-row';

/** 新条目的缺省值：触发键取内置图首条，动作条目取目录首项，条件留空（不限） */
const NEW_ENTRY: InteractionGraphEntry = {
  key: DEFAULT_INTERACTION_GRAPH[0]?.key ?? 'touch::head::tap',
  chainId: 'head-tap',
};

/**
 * v2.3 交互动画图设置：可视化编辑「区域 / 手势 / 状态 → 动作条目」的覆盖条目。
 *
 * 与其它面板不同，这里用「本地草稿 + 显式保存」而不是即时保存——因为要整表替换数组，
 * 逐字段即时保存会在网络往返窗口内互相覆盖。服务端值更新后草稿自动收敛。
 */
export function InteractionGraphPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const serverRows = React.useMemo(
    () => settings?.interactionGraphOverrides ?? [],
    [settings?.interactionGraphOverrides],
  );
  const [draft, setDraft] = React.useState<InteractionGraphEntry[] | null>(null);
  React.useEffect(() => setDraft(null), [serverRows]);

  const rows = draft ?? serverRows;
  const dirty = draft !== null;

  const update = (index: number, next: InteractionGraphEntry) =>
    setDraft(rows.map((row, i) => (i === index ? next : row)));
  const remove = (index: number) => setDraft(rows.filter((_, i) => i !== index));
  const add = () => setDraft([...rows, { ...NEW_ENTRY }]);

  const save = async () => {
    try {
      await updateSettings.mutateAsync({ interactionGraphOverrides: rows });
      setDraft(null);
    } catch {
      // 失败保留草稿（全局 toast 已报错），用户可重试或放弃
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="interaction-graph-panel">
      <div>
        <h3 className="font-medium">{t('settingsGraph.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settingsGraph.description')}</p>
      </div>

      <div className="space-y-2" data-testid="interaction-graph-rows">
        {hydrated &&
          rows.map((row, index) => (
            <InteractionGraphRow
              key={index}
              entry={row}
              index={index}
              onChange={(next) => update(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        {hydrated && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('settingsGraph.empty')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button
          type="button"
          onClick={add}
          disabled={rows.length >= INTERACTION_GRAPH_OVERRIDES_MAX}
          data-testid="interaction-graph-add"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {t('settingsGraph.add')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || updateSettings.isPending}
          data-testid="interaction-graph-save"
          className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary disabled:opacity-50"
        >
          {t('settingsGraph.save')}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(null)}
            data-testid="interaction-graph-reset"
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            {t('settingsGraph.reset')}
          </button>
        )}
        {dirty && <span className="text-xs text-muted-foreground">{t('settingsGraph.dirtyHint')}</span>}
      </div>

      <p className="text-xs text-muted-foreground">{t('settingsGraph.hint')}</p>
      <p className="text-xs text-muted-foreground">{t('settingsGraph.savedHint')}</p>
    </section>
  );
}
