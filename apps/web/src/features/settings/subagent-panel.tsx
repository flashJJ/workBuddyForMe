'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppSettings } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { SubagentRunList } from './subagent-run-list';
import {
  useStartSubagentRun,
  useSubagentProviders,
  useSubagentRuns,
} from './use-subagent-runs';

interface Draft {
  enabled: boolean;
  command: string;
  argsText: string;
  timeoutMs: string;
  outputBytes: string;
}

const EMPTY_DRAFT: Draft = {
  enabled: false,
  command: '',
  argsText: '',
  timeoutMs: '600000',
  outputBytes: '2097152',
};

function draftOf(settings: AppSettings | undefined): Draft {
  return {
    enabled: settings?.subagentCliEnabled === true,
    command: settings?.subagentCliCommand ?? '',
    argsText: (settings?.subagentCliArgs ?? []).join('\n'),
    timeoutMs: String(settings?.subagentCliTimeoutMs ?? 600000),
    outputBytes: String(settings?.subagentCliMaxOutputBytes ?? 2097152),
  };
}

const INPUT = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const TEXTAREA = 'w-full rounded-md border bg-background p-2 text-sm';

/** v2.11：外部代理（本地 CLI）配置、提供方、发起运行与记录 */
export function SubagentPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const providers = useSubagentProviders();
  const runs = useSubagentRuns(true);
  const start = useStartSubagentRun();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [goal, setGoal] = React.useState('');
  const [cwd, setCwd] = React.useState('');

  React.useEffect(() => {
    if (settings) setDraft(draftOf(settings));
  }, [settings]);

  const current = draft ?? EMPTY_DRAFT;
  const set = (patch: Partial<Draft>) => setDraft({ ...current, ...patch });

  const saveConfig = async () => {
    try {
      await update.mutateAsync({
        subagentCliEnabled: current.enabled,
        subagentCliCommand: current.command.trim(),
        subagentCliArgs: current.argsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        subagentCliTimeoutMs: Number(current.timeoutMs),
        subagentCliMaxOutputBytes: Number(current.outputBytes),
      } as Partial<AppSettings>);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.subagentProviders });
      toast.success(t('subagent.saved'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'subagent.saveError', withDetail: true }));
    }
  };

  const startRun = async () => {
    try {
      await start.mutateAsync({ goal: goal.trim(), cwd: cwd.trim() });
      toast.success(t('subagent.runStarted'));
      setGoal('');
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'subagent.runError', withDetail: true }));
    }
  };

  const providerList = providers.data?.providers ?? [];

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="subagent-panel">
      <div>
        <h3 className="font-medium">{t('subagent.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('subagent.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={current.enabled}
          onChange={(event) => set({ enabled: event.target.checked })}
          data-testid="subagent-enabled"
        />
        <span className="text-sm font-medium">{t('subagent.enabled')}</span>
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">{t('subagent.enabledHint')}</p>

      <div className="space-y-3 border-t pt-3">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="subagent-command">
            {t('subagent.command')}
          </label>
          <input
            id="subagent-command"
            className={INPUT}
            value={current.command}
            onChange={(event) => set({ command: event.target.value })}
            data-testid="subagent-command"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="subagent-args">
            {t('subagent.args')}
          </label>
          <textarea
            id="subagent-args"
            className={TEXTAREA}
            rows={3}
            value={current.argsText}
            onChange={(event) => set({ argsText: event.target.value })}
            data-testid="subagent-args"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="subagent-timeout">
              {t('subagent.timeoutMs')}
            </label>
            <input
              id="subagent-timeout"
              className={INPUT}
              value={current.timeoutMs}
              onChange={(event) => set({ timeoutMs: event.target.value })}
              data-testid="subagent-timeout"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="subagent-output">
              {t('subagent.maxOutputBytes')}
            </label>
            <input
              id="subagent-output"
              className={INPUT}
              value={current.outputBytes}
              onChange={(event) => set({ outputBytes: event.target.value })}
              data-testid="subagent-output"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={update.isPending} onClick={() => void saveConfig()}>
            {t('subagent.save')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('subagent.configHint')}</span>
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-medium">{t('subagent.providers')}</h4>
        {providerList.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('subagent.noProviders')}</p>
        ) : (
          <ul className="space-y-1" data-testid="subagent-providers">
            {providerList.map((provider) => (
              <li key={provider.id} className="flex items-center gap-2 text-sm">
                <Badge variant={provider.available ? 'success' : 'outline'}>
                  {provider.available ? t('subagent.available') : t('subagent.unavailable')}
                </Badge>
                <span>{provider.label}</span>
                <span className="text-xs text-muted-foreground">{provider.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-medium">{t('subagent.runTitle')}</h4>
        <div className="space-y-1">
          <label className="text-sm" htmlFor="subagent-goal">
            {t('subagent.goal')}
          </label>
          <input
            id="subagent-goal"
            className={INPUT}
            placeholder={t('subagent.goalPlaceholder')}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            data-testid="subagent-goal"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm" htmlFor="subagent-cwd">
            {t('subagent.cwd')}
          </label>
          <input
            id="subagent-cwd"
            className={INPUT}
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            data-testid="subagent-cwd"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={start.isPending || !goal.trim() || !cwd.trim()}
            onClick={() => void startRun()}
          >
            {t('subagent.run')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('subagent.approvalHint')}</span>
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t('subagent.runs')}</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runs.refetch()}
          >
            {t('subagent.refresh')}
          </Button>
        </div>
        <SubagentRunList runs={runs.data ?? []} />
      </div>
    </section>
  );
}
