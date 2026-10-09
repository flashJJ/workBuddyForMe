'use client';

import * as React from 'react';
import type { ToolPermission } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useToolPermissions, useToolPermissionMutations } from '@/lib/hooks/use-permissions';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { errorText } from '@/lib/i18n/resolve-error';

export function PermissionPanel() {
  const { t } = useI18n();
  const intl = useIntl();
  const formatDate = (iso: string) =>
    intl.formatDateTime(iso, { month: 'numeric', day: 'numeric' });
  const { data: permissions, isLoading } = useToolPermissions();
  const mutations = useToolPermissionMutations();
  const toast = useToast();

  const formatScope = (scope: string): string => {
    if (scope === 'all') return t('settingsMcp.permission.scopeGlobal');
    if (scope.startsWith('assistant:')) {
      return t('settingsMcp.permission.scopeAssistant', {
        id: scope.slice('assistant:'.length),
      });
    }
    return scope;
  };

  const revoke = async (id: string) => {
    try {
      await mutations.revoke.mutateAsync(id);
      toast.success(t('settingsMcp.permission.revoked'));
    } catch (error: unknown) {
      toast.error(errorText(error, t, { fallback: 'settingsMcp.permission.revokeFailed' }));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('settingsMcp.permission.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('settingsMcp.permission.description')}
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>
      )}

      {!isLoading && (!permissions || permissions.length === 0) && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('settingsMcp.permission.empty')}
        </p>
      )}

      {!isLoading && permissions && permissions.length > 0 && (
        <div className="space-y-2">
          {(permissions as ToolPermission[]).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 font-medium">
                  <code className="rounded bg-muted px-1 text-xs">{p.toolName}</code>
                  <span className="text-xs text-muted-foreground">{formatScope(p.scope)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('settingsMcp.permission.grantedAt', { date: formatDate(p.grantedAt) })}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutations.revoke.isPending}
                onClick={() => void revoke(p.id)}
                className="ml-2 shrink-0"
              >
                {t('settingsMcp.permission.revoke')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
