'use client';

import * as React from 'react';
import {
  PET_SCRIPT_JOURNAL_DEFAULT_RETENTION,
  PET_SCRIPT_JOURNAL_RETENTION_OPTIONS,
  PET_SCRIPT_SCHEDULE_LIMITS,
  type PetScriptJournalSettings,
  type PetScriptScheduleSummary,
  type PetScriptStatusView,
} from '@wbfm/shared/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';

const QUERY_KEY = ['pet-script-schedule'] as const;
const JOURNAL_QUERY_KEY = ['pet-script-journal-settings'] as const;
const PER_DAY_OPTIONS = Array.from(
  { length: PET_SCRIPT_SCHEDULE_LIMITS.maxPerDay - PET_SCRIPT_SCHEDULE_LIMITS.minPerDay + 1 },
  (_, index) => PET_SCRIPT_SCHEDULE_LIMITS.minPerDay + index,
);

/**
 * P8.6：每日自动生成开关/次数与回顾保留（设置页入口，dev 面板仍保留快捷切换）。
 *
 * 只读写持久化的调度间隔与日记保留策略，不在这里生成；到期判定仍由桌宠心跳 tick 驱动。
 * 乐观覆盖 + 失败回滚，避免受控控件在状态重拉窗口被旧值弹回。
 */
export function ScriptSchedulePanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useVisibleQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<PetScriptStatusView>('/api/pet/script'),
    staleTime: 60_000,
  });
  const journalQuery = useVisibleQuery({
    queryKey: JOURNAL_QUERY_KEY,
    queryFn: () => apiGet<PetScriptJournalSettings>('/api/pet/script/journal/settings'),
    staleTime: 60_000,
  });
  const [override, setOverride] = React.useState<{ enabled?: boolean; perDay?: number }>({});
  const [retentionOverride, setRetentionOverride] = React.useState<number | null | undefined>(
    undefined,
  );
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const schedule = query.data?.schedule ?? null;
  const enabled = override.enabled ?? schedule?.enabled ?? false;
  const perDay = override.perDay ?? schedule?.perDay ?? PET_SCRIPT_SCHEDULE_LIMITS.defaultPerDay;
  const retention =
    retentionOverride !== undefined
      ? retentionOverride
      : journalQuery.data?.retentionDays ?? PET_SCRIPT_JOURNAL_DEFAULT_RETENTION;

  const save = async (patch: { enabled?: boolean; perDay?: number }) => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setOverride(patch);
    try {
      const result = await apiPost<{ schedule: PetScriptScheduleSummary }>(
        '/api/pet/script/schedule',
        patch,
      );
      queryClient.setQueryData<PetScriptStatusView>(QUERY_KEY, (prev) =>
        prev ? { ...prev, schedule: result.schedule } : prev,
      );
      setOverride({});
    } catch {
      setOverride({});
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const saveRetention = async (retentionDays: number | null) => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setRetentionOverride(retentionDays);
    try {
      const result = await apiPost<PetScriptJournalSettings>(
        '/api/pet/script/journal/settings',
        { retentionDays },
      );
      queryClient.setQueryData<PetScriptJournalSettings>(JOURNAL_QUERY_KEY, result);
      setRetentionOverride(undefined);
    } catch {
      setRetentionOverride(undefined);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="script-schedule-panel">
      <div>
        <h3 className="font-medium">{t('settings.script.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.script.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={enabled}
          disabled={saving}
          onChange={(event) => void save({ enabled: event.target.checked })}
          data-testid="script-schedule-enabled"
        />
        <span className="text-sm font-medium">{t('settings.script.enabled')}</span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="script-per-day" className="text-sm">
          {t('settings.script.perDay')}
        </label>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <select
            id="script-per-day"
            value={perDay}
            disabled={saving}
            onChange={(event) => void save({ perDay: Number(event.target.value) })}
            data-testid="script-schedule-per-day"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {PER_DAY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {t('settings.script.perDayUnit')}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="journal-retention" className="text-sm">
          {t('settings.script.retention')}
        </label>
        <select
          id="journal-retention"
          value={retention === null ? 'forever' : String(retention)}
          disabled={saving}
          onChange={(event) => {
            const value = event.target.value;
            void saveRetention(value === 'forever' ? null : Number(value));
          }}
          data-testid="journal-retention"
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {PET_SCRIPT_JOURNAL_RETENTION_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {t('settings.script.retentionDays', { days })}
            </option>
          ))}
          <option value="forever">{t('settings.script.retentionForever')}</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.script.retentionHint')}</p>

      {schedule && (
        <p className="text-xs text-muted-foreground">
          {t('settings.script.today', { runs: schedule.runsToday, limit: schedule.perDay })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t('settings.script.enabledHint')}</p>
      {failed && <p className="text-xs text-destructive">{t('settings.script.saveFailed')}</p>}
    </section>
  );
}
