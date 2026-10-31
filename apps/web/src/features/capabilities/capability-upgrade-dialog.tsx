'use client';

import * as React from 'react';
import type { CapabilityView } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError, apiUpload } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

interface Props {
  capability: CapabilityView | null;
  onOpenChange: (open: boolean) => void;
  onUpgraded: () => void;
}

interface UpgradeResponse {
  capability: CapabilityView;
  upgrade?: { direction?: 'upgrade' | 'downgrade' | 'repair'; to?: string };
}

type Probe =
  | { kind: 'downgrade'; target: string; current: string }
  | { kind: 'repair'; target: string };

const DIRECTION_KEYS: Record<string, MessageKey> = {
  upgrade: 'capabilities.upgrade.direction.upgrade',
  downgrade: 'capabilities.upgrade.direction.downgrade',
  repair: 'capabilities.upgrade.direction.repair',
};

/**
 * v2.12：升级对话框（选 ZIP → 提交 → 成功刷新 / 失败提示已回滚）。
 * v2.14：首次提交只探测方向；降级需勾选确认并携带目标版本，同版本差异需显式修复。
 */
export function CapabilityUpgradeDialog({ capability, onOpenChange, onUpgraded }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [probe, setProbe] = React.useState<Probe | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const resetProbe = () => {
    setProbe(null);
    setAcknowledged(false);
    setError(null);
  };

  React.useEffect(() => {
    if (!capability) {
      setFile(null);
      setError(null);
      setPending(false);
      setProbe(null);
      setAcknowledged(false);
    }
  }, [capability]);

  const handleError = (e: unknown) => {
    if (!(e instanceof ApiClientError)) {
      setError(t('capabilities.upgrade.failed'));
      return;
    }
    const details = (e.details ?? {}) as Record<string, unknown>;
    if (e.code === 'CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED') {
      setProbe({
        kind: 'downgrade',
        target: String(details.targetVersion ?? ''),
        current: String(details.currentVersion ?? capability?.version ?? ''),
      });
      setAcknowledged(false);
      setError(null);
      return;
    }
    if (e.code === 'CAPABILITY_VERSION_NOT_NEWER' && details.repairAvailable === true) {
      setProbe({ kind: 'repair', target: String(details.targetVersion ?? capability?.version ?? '') });
      setError(null);
      return;
    }
    if (e.code === 'CAPABILITY_DEPENDENTS_ACTIVE') {
      const dependents = Array.isArray(details.dependents)
        ? details.dependents.map((item) => String(item)).join(', ')
        : '';
      setError(t('capabilities.upgrade.probeDependents', { dependents }));
      return;
    }
    setError(e.message);
  };

  const submit = async (options: {
    confirmDowngrade?: boolean;
    expectedVersion?: string;
    repair?: boolean;
  } = {}) => {
    if (!capability || !file) return;
    const form = new FormData();
    form.append('file', file);
    if (options.confirmDowngrade) form.append('confirmDowngrade', 'true');
    if (options.expectedVersion) form.append('expectedVersion', options.expectedVersion);
    if (options.repair) form.append('repair', 'true');

    setPending(true);
    try {
      const result = await apiUpload<UpgradeResponse>(API.capabilityUpgrade(capability.id), form);
      const direction = result.upgrade?.direction ?? 'upgrade';
      toast.success(
        t(DIRECTION_KEYS[direction] ?? 'capabilities.upgrade.success', {
          version: result.upgrade?.to ?? capability.version,
        }),
      );
      onUpgraded();
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setPending(false);
    }
  };

  const canSubmit = probe?.kind === 'downgrade' ? acknowledged : true;

  return (
    <Dialog open={Boolean(capability)} onOpenChange={onOpenChange}>
      <DialogContent data-testid="capability-upgrade-dialog">
        <DialogHeader>
          <DialogTitle>{t('capabilities.upgrade.title')}</DialogTitle>
          <DialogDescription>
            {capability
              ? `${capability.name} · ${t('capabilities.upgrade.current')} v${capability.version}`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            type="file"
            accept=".zip,application/zip"
            data-testid="capability-upgrade-file"
            className="text-xs"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetProbe();
            }}
          />
          <p className="text-xs text-muted-foreground">{t('capabilities.upgrade.hint')}</p>

          {probe?.kind === 'downgrade' && (
            <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3">
              <p className="text-sm font-medium">{t('capabilities.upgrade.probeDowngradeTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('capabilities.upgrade.probeDowngradeWarning', {
                  target: probe.target,
                  current: probe.current,
                })}
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  data-testid="capability-upgrade-downgrade-ack"
                  className="h-4 w-4"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                {t('capabilities.upgrade.probeDowngradeAck')}
              </label>
            </div>
          )}

          {probe?.kind === 'repair' && (
            <div className="space-y-1 rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium">{t('capabilities.upgrade.probeRepairTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('capabilities.upgrade.probeRepairWarning', { version: probe.target })}
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            data-testid="capability-upgrade-confirm"
            disabled={!file || pending || !canSubmit}
            onClick={() => {
              if (probe?.kind === 'downgrade') {
                void submit({
                  confirmDowngrade: true,
                  expectedVersion: probe.target,
                });
                return;
              }
              if (probe?.kind === 'repair') {
                void submit({ repair: true });
                return;
              }
              void submit();
            }}
          >
            {pending
              ? t('capabilities.upgrade.pending')
              : probe?.kind === 'downgrade'
                ? t('capabilities.upgrade.probeDowngradeConfirm')
                : probe?.kind === 'repair'
                  ? t('capabilities.upgrade.probeRepairConfirm')
                  : t('capabilities.upgrade.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
