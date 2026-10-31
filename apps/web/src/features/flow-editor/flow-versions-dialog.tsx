'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import type { WorkflowView } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiClientError } from '@/lib/api/client';
import { useFlowMutations, useFlowVersions } from '@/lib/hooks/use-flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

/** v2.14：工作流版本抽屉——展示当前/生产徽章，并把任意历史版本设为生产 */
export function FlowVersionsButton({ workflow }: { workflow: WorkflowView }) {
  const { t } = useI18n();
  const intl = useIntl();
  const [open, setOpen] = React.useState(false);
  const versions = useFlowVersions(workflow.id, open);
  const mutations = useFlowMutations();
  const toast = useToast();
  const confirm = useConfirm();

  const setProduction = async (version: number) => {
    if (
      !(await confirm({
        title: t('flowEditor.versions.setProductionTitle'),
        description: t('flowEditor.versions.setProductionConfirm', { version }),
        confirmText: t('flowEditor.versions.setProductionButton'),
      }))
    ) {
      return;
    }
    mutations.setProduction.mutate(
      { id: workflow.id, version },
      {
        onSuccess: () =>
          toast.success(t('flowEditor.versions.setProductionDone', { version })),
        onError: (error) =>
          toast.error(
            error instanceof ApiClientError
              ? error.message
              : t('flowEditor.versions.setProductionFailed'),
          ),
      },
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" />
        {t('flowEditor.versions.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('flowEditor.versions.title')}</DialogTitle>
            <DialogDescription>{t('flowEditor.versions.description')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto" data-testid="flow-version-list">
            {versions.isLoading && (
              <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>
            )}
            {versions.isError && (
              <p className="text-sm text-destructive">{t('flowEditor.versions.loadFailed')}</p>
            )}
            {versions.data && versions.data.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('flowEditor.versions.empty')}</p>
            )}
            {versions.data && versions.data.length > 0 && (
              <ul className="space-y-2">
                {versions.data.map((version) => (
                  <li
                    key={version.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2"
                    data-testid="flow-version-item"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">v{version.version}</span>
                        {version.version === workflow.currentVersion && (
                          <Badge variant="outline">{t('flowEditor.versions.current')}</Badge>
                        )}
                        {version.production && (
                          <Badge variant="success">{t('flowEditor.versions.production')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('flowEditor.versions.createdAt', {
                          date: intl.formatCompactDateTime(version.createdAt),
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={version.production || mutations.setProduction.isPending}
                      onClick={() => void setProduction(version.version)}
                    >
                      {t('flowEditor.versions.setProduction')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
