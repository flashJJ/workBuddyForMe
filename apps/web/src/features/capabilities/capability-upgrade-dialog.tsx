'use client';

import * as React from 'react';
import type { CapabilityView } from '@wbfm/shared/schemas';
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
import { apiUpload } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

interface Props {
  capability: CapabilityView | null;
  onOpenChange: (open: boolean) => void;
  onUpgraded: () => void;
}

/** v2.12：升级对话框（选 ZIP → 提交 → 成功刷新 / 失败提示已回滚） */
export function CapabilityUpgradeDialog({ capability, onOpenChange, onUpgraded }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!capability) {
      setFile(null);
      setError(null);
      setPending(false);
    }
  }, [capability]);

  const submit = async () => {
    if (!capability || !file) return;
    const form = new FormData();
    form.append('file', file);
    setPending(true);
    try {
      await apiUpload<{ capability: CapabilityView }>(API.capabilityUpgrade(capability.id), form);
      setError(null);
      toast.success(t('capabilities.upgrade.success'));
      onUpgraded();
      onOpenChange(false);
    } catch {
      setError(t('capabilities.upgrade.failed'));
    } finally {
      setPending(false);
    }
  };

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
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">{t('capabilities.upgrade.hint')}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            data-testid="capability-upgrade-confirm"
            disabled={!file || pending}
            onClick={() => void submit()}
          >
            {pending ? t('capabilities.upgrade.pending') : t('capabilities.upgrade.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
