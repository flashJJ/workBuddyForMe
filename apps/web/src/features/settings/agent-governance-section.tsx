'use client';

import * as React from 'react';
import type { AgentPermissionMode, AgentPolicy, AgentUnattendedMode } from '@wbfm/shared/schemas';
import {
  AGENT_UNATTENDED_MODES,
  DEFAULT_AGENT_POLICY,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

const INPUT = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const AREA = 'min-h-20 w-full rounded-md border bg-background p-2 font-mono text-xs';

const MODE_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modes.confirm_each',
  auto_edits: 'tasks.governance.modes.auto_edits',
  smart_approve: 'tasks.governance.modes.smart_approve',
  plan_only: 'tasks.governance.modes.plan_only',
  full_access: 'tasks.governance.modes.full_access',
};

const MODES: AgentPermissionMode[] = [
  'confirm_each',
  'auto_edits',
  'smart_approve',
  'plan_only',
  'full_access',
];

function lines(values: string[]): string {
  return values.join('\n');
}

function fromLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function ListField(props: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {props.label}
      <textarea
        className={AREA}
        value={lines(props.value)}
        onChange={(event) => props.onChange(fromLines(event.target.value))}
      />
    </label>
  );
}

/** v2.13 M2：Agent 治理策略（settings JSON；deny wins） */
export function AgentGovernanceSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [policy, setPolicy] = React.useState<AgentPolicy>(DEFAULT_AGENT_POLICY);

  React.useEffect(() => {
    if (settings?.agentPolicy) setPolicy(settings.agentPolicy);
  }, [settings]);

  const patch = (next: Partial<AgentPolicy>) => setPolicy((current) => ({ ...current, ...next }));
  const patchTools = (next: Partial<AgentPolicy['tools']>) =>
    setPolicy((current) => ({ ...current, tools: { ...current.tools, ...next } }));
  const patchPaths = (next: Partial<AgentPolicy['paths']>) =>
    setPolicy((current) => ({ ...current, paths: { ...current.paths, ...next } }));
  const patchDomains = (next: Partial<AgentPolicy['domains']>) =>
    setPolicy((current) => ({ ...current, domains: { ...current.domains, ...next } }));
  const patchExec = (next: Partial<AgentPolicy['exec']>) =>
    setPolicy((current) => ({ ...current, exec: { ...current.exec, ...next } }));
  const patchLimits = (next: Partial<AgentPolicy['limits']>) =>
    setPolicy((current) => ({ ...current, limits: { ...current.limits, ...next } }));

  const toggleUnattended = (mode: AgentUnattendedMode, checked: boolean) => {
    setPolicy((current) => ({
      ...current,
      unattended: {
        ...current.unattended,
        allowedModes: checked
          ? [...current.unattended.allowedModes, mode]
          : current.unattended.allowedModes.filter((item) => item !== mode),
      },
    }));
  };

  const save = () => {
    update.mutate(
      { agentPolicy: policy },
      {
        onSuccess: () => toast.success(t('tasks.governance.policy.saved')),
        onError: () => toast.error(t('tasks.governance.policy.saveFailed')),
      },
    );
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="agent-governance">
      <div>
        <h3 className="text-sm font-semibold">{t('tasks.governance.policy.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('tasks.governance.policy.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('tasks.governance.policy.defaultMode')}
          <SimpleSelect
            value={policy.defaultMode}
            onValueChange={(value) => patch({ defaultMode: value as AgentPermissionMode })}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(MODE_KEYS[mode])}
              </option>
            ))}
          </SimpleSelect>
        </label>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('tasks.governance.policy.unattended')}
          <div className="flex flex-wrap gap-3 rounded-md border px-3 py-2">
            {AGENT_UNATTENDED_MODES.map((mode) => (
              <label key={mode} className="flex items-center gap-1 text-foreground">
                <input
                  type="checkbox"
                  checked={policy.unattended.allowedModes.includes(mode)}
                  onChange={(event) => toggleUnattended(mode, event.target.checked)}
                />
                {t(MODE_KEYS[mode])}
              </label>
            ))}
          </div>
          <span>{t('tasks.governance.policy.unattendedHint')}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold">{t('tasks.governance.policy.tools')}</h4>
        <p className="text-[11px] text-muted-foreground">
          {t('tasks.governance.policy.rulesHint')}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <ListField
            label={t('tasks.governance.policy.deny')}
            value={policy.tools.deny}
            onChange={(deny) => patchTools({ deny })}
          />
          <ListField
            label={t('tasks.governance.policy.allow')}
            value={policy.tools.allow}
            onChange={(allow) => patchTools({ allow })}
          />
          <ListField
            label={t('tasks.governance.policy.dangerAllow')}
            value={policy.tools.dangerAllow}
            onChange={(dangerAllow) => patchTools({ dangerAllow })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold">{t('tasks.governance.policy.paths')}</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <ListField
            label={t('tasks.governance.policy.allowedRoots')}
            value={policy.paths.allowedRoots}
            onChange={(allowedRoots) => patchPaths({ allowedRoots })}
          />
          <ListField
            label={t('tasks.governance.policy.deniedRoots')}
            value={policy.paths.deniedRoots}
            onChange={(deniedRoots) => patchPaths({ deniedRoots })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold">{t('tasks.governance.policy.domains')}</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <ListField
            label={t('tasks.governance.policy.allowDomains')}
            value={policy.domains.allow}
            onChange={(allow) => patchDomains({ allow })}
          />
          <ListField
            label={t('tasks.governance.policy.denyDomains')}
            value={policy.domains.deny}
            onChange={(deny) => patchDomains({ deny })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold">{t('tasks.governance.policy.exec')}</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <ListField
            label={t('tasks.governance.policy.allowCommands')}
            value={policy.exec.allowCommands}
            onChange={(allowCommands) => patchExec({ allowCommands })}
          />
          <ListField
            label={t('tasks.governance.policy.denyCommands')}
            value={policy.exec.denyCommands}
            onChange={(denyCommands) => patchExec({ denyCommands })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold">{t('tasks.governance.policy.limits')}</h4>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('tasks.governance.policy.maxSteps')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={50}
              value={policy.limits.maxSteps}
              onChange={(event) => patchLimits({ maxSteps: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('tasks.governance.policy.maxRuntimeMinutes')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={60}
              value={Math.round(policy.limits.maxRuntimeMs / 60_000)}
              onChange={(event) =>
                patchLimits({ maxRuntimeMs: (Number(event.target.value) || 0) * 60_000 })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('tasks.governance.policy.maxWrites')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={1000}
              value={policy.limits.maxWritesPerRun}
              onChange={(event) =>
                patchLimits({ maxWritesPerRun: Number(event.target.value) || 0 })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('tasks.governance.policy.maxExternalCalls')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={200}
              value={policy.limits.maxExternalCallsPerRun}
              onChange={(event) =>
                patchLimits({ maxExternalCallsPerRun: Number(event.target.value) || 0 })
              }
            />
          </label>
        </div>
      </div>

      <Button onClick={save} disabled={update.isPending}>
        {t('tasks.governance.policy.save')}
      </Button>
    </section>
  );
}
