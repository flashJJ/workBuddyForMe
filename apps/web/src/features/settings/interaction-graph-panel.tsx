'use client';

import * as React from 'react';
import {
  DEFAULT_INTERACTION_GRAPH,
  INTERACTION_GRAPH_OVERRIDES_MAX,
  type InteractionGraphCondition,
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

/** 面板草稿：覆盖条目 + 被停用的内置条目 id（两者一起提交） */
interface GraphDraft {
  overrides: InteractionGraphEntry[];
  disabledEntryIds: string[];
}

/**
 * v2.3 交互动画图设置：可视化编辑「区域 / 手势 / 状态 → 动作条目」。
 *
 * - 内置条目区：只读展示 + 可「停用」（剔除该条目的兜底）+ 可「覆盖」（按其键/条件预填一条覆盖条目）；
 * - 自定义条目区：增删改覆盖条目。
 * 与其它面板不同，这里用「本地草稿 + 显式保存」而不是即时保存——因为要整表替换数组，
 * 逐字段即时保存会在网络往返窗口内互相覆盖。服务端值更新后草稿自动收敛。
 */
export function InteractionGraphPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const serverDraft = React.useMemo<GraphDraft>(
    () => ({
      overrides: settings?.interactionGraphOverrides ?? [],
      disabledEntryIds: settings?.interactionGraphDisabledEntryIds ?? [],
    }),
    [settings?.interactionGraphOverrides, settings?.interactionGraphDisabledEntryIds],
  );
  const [draft, setDraft] = React.useState<GraphDraft | null>(null);
  React.useEffect(() => setDraft(null), [serverDraft]);

  const current = draft ?? serverDraft;
  const dirty = draft !== null;

  const setOverrides = (overrides: InteractionGraphEntry[]) =>
    setDraft({ ...current, overrides });
  const update = (index: number, next: InteractionGraphEntry) =>
    setOverrides(current.overrides.map((row, i) => (i === index ? next : row)));
  const remove = (index: number) =>
    setOverrides(current.overrides.filter((_, i) => i !== index));
  const add = () => setOverrides([...current.overrides, { ...NEW_ENTRY }]);

  /** 停用/启用某个内置条目 */
  const toggleBuiltin = (id: string, enabled: boolean) =>
    setDraft({
      ...current,
      disabledEntryIds: enabled
        ? current.disabledEntryIds.filter((item) => item !== id)
        : [...current.disabledEntryIds, id],
    });

  /** 覆盖某个内置条目：按其键与条件预填一条覆盖条目（覆盖条目排在内置图之前，优先生效） */
  const overrideBuiltin = (entry: InteractionGraphEntry) =>
    setOverrides([
      ...current.overrides,
      {
        key: entry.key,
        chainId: entry.chainId,
        ...(entry.condition ? { condition: { ...entry.condition } } : {}),
      },
    ]);

  const conditionSummary = (condition?: InteractionGraphCondition): string => {
    const parts: string[] = [];
    if (condition?.minLevel) parts.push(`${t('settingsGraph.levelLabel')}≥${condition.minLevel}`);
    if (condition?.mood) parts.push(`${t('settingsGraph.moodLabel')}=${condition.mood}`);
    if (condition?.hours) {
      parts.push(
        `${t('settingsGraph.hoursLabel')} ${condition.hours.startHour}:00–${condition.hours.endHour}:00`,
      );
    }
    return parts.length > 0 ? parts.join(' · ') : t('settingsGraph.any');
  };

  const save = async () => {
    try {
      await updateSettings.mutateAsync({
        interactionGraphOverrides: current.overrides,
        interactionGraphDisabledEntryIds: current.disabledEntryIds,
      });
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

      {/* 内置条目：只读展示 + 停用 / 覆盖 */}
      <div className="space-y-2" data-testid="interaction-graph-builtins">
        <div className="text-sm font-medium">{t('settingsGraph.builtinsTitle')}</div>
        <p className="text-xs text-muted-foreground">{t('settingsGraph.builtinsHint')}</p>
        {hydrated &&
          DEFAULT_INTERACTION_GRAPH.map((entry) => {
            const enabled = !current.disabledEntryIds.includes(entry.id ?? '');
            const overridden = current.overrides.some((row) => row.key === entry.key);
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 p-3"
                data-testid={`graph-builtin-${entry.id}`}
              >
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    data-testid={`graph-builtin-enabled-${entry.id}`}
                    checked={enabled}
                    onChange={(e) => toggleBuiltin(entry.id ?? '', e.target.checked)}
                  />
                  {t('settingsGraph.enabledLabel')}
                </label>
                <span className="font-mono text-xs">{entry.key}</span>
                {overridden && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t('settingsGraph.overriddenBadge')}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{conditionSummary(entry.condition)}</span>
                <span className="ml-auto text-xs text-muted-foreground">→ {entry.chainId}</span>
                <button
                  type="button"
                  data-testid={`graph-builtin-override-${entry.id}`}
                  onClick={() => overrideBuiltin(entry)}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  {t('settingsGraph.overrideAction')}
                </button>
              </div>
            );
          })}
      </div>

      {/* 自定义（覆盖）条目 */}
      <div className="space-y-2 border-t pt-3" data-testid="interaction-graph-rows">
        {hydrated &&
          current.overrides.map((row, index) => (
            <InteractionGraphRow
              key={index}
              entry={row}
              index={index}
              onChange={(next) => update(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        {hydrated && current.overrides.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('settingsGraph.empty')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button
          type="button"
          onClick={add}
          disabled={current.overrides.length >= INTERACTION_GRAPH_OVERRIDES_MAX}
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
