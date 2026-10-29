'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CapabilityView } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiDelete, apiGet, apiPost, apiUpload } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.10 能力包管理页：安装/启停/卸载 + 权限/effect 可见 */
export function CapabilitiesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEYS.capabilities,
    queryFn: () => apiGet<CapabilityView[]>(API.capabilities),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.capabilities });

  const install = useMutation({
    mutationFn: (selected: File) => {
      const form = new FormData();
      form.append('file', selected);
      return apiUpload<CapabilityView>(API.capabilityInstall, form);
    },
    onSuccess: () => {
      setError(null);
      setFile(null);
      invalidate();
    },
    onError: () => setError(t('capabilities.installFailed')),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPost<CapabilityView>(
        enabled ? API.capabilityEnable(id) : API.capabilityDisable(id),
      ),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: () => setError(t('capabilities.actionFailed')),
  });

  const uninstall = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(API.capability(id)),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: () => setError(t('capabilities.actionFailed')),
  });

  const capabilities = query.data ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="capabilities-page">
      <PageHeader
        title={t('capabilities.title')}
        description={t('capabilities.description')}
        actions={
          <a
            href={API.capabilitySample}
            data-testid="capability-sample-link"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            {t('capabilities.sample')}
          </a>
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-4">
        <input
          type="file"
          accept=".zip,application/zip"
          data-testid="capability-file-input"
          className="text-xs"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button
          size="sm"
          data-testid="capability-install-button"
          disabled={!file || install.isPending}
          onClick={() => {
            if (file) install.mutate(file);
          }}
        >
          {install.isPending ? t('capabilities.installing') : t('capabilities.install')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('capabilities.uploadHint')}</span>
      </section>

      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState message={t('capabilities.actionFailed')} onRetry={() => void query.refetch()} />
      ) : capabilities.length === 0 ? (
        <EmptyState title={t('capabilities.empty')} />
      ) : (
        <ul className="space-y-3">
          {capabilities.map((capability) => (
            <li
              key={capability.id}
              data-testid={`capability-${capability.id}`}
              className="space-y-2 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={capability.status === 'enabled' ? 'success' : 'outline'}>
                  {capability.status === 'enabled'
                    ? t('capabilities.statusEnabled')
                    : t('capabilities.statusDisabled')}
                </Badge>
                <Badge variant="info">{t(`capabilities.kind.${capability.kind}`)}</Badge>
                <span className="text-sm font-medium">{capability.name}</span>
                <span className="text-xs text-muted-foreground">
                  {capability.id} · v{capability.version}
                </span>
              </div>
              {capability.description && (
                <p className="text-xs text-muted-foreground">{capability.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span>{t('capabilities.permissions')}:</span>
                {capability.permissions.length === 0 ? (
                  <span>{t('capabilities.noPermission')}</span>
                ) : (
                  capability.permissions.map((permission) => (
                    <Badge key={permission} variant="outline" className="px-1.5 py-0">
                      {permission}
                    </Badge>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('capabilities.effect')}: {capability.effectRef ?? t('capabilities.noEffect')}
              </p>
              {capability.lastError && (
                <p className="text-xs text-destructive">
                  {t('capabilities.lastError')}: {capability.lastError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={capability.status === 'enabled' ? 'outline' : 'default'}
                  disabled={toggle.isPending}
                  onClick={() =>
                    toggle.mutate({
                      id: capability.id,
                      enabled: capability.status !== 'enabled',
                    })
                  }
                >
                  {capability.status === 'enabled'
                    ? t('capabilities.disable')
                    : t('capabilities.enable')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={uninstall.isPending}
                  onClick={() => uninstall.mutate(capability.id)}
                >
                  {t('capabilities.uninstall')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-1 rounded-lg border bg-muted/30 p-4" data-testid="capability-external">
        <h2 className="text-sm font-medium">{t('capabilities.external')}</h2>
        <p className="text-xs text-muted-foreground">{t('capabilities.externalHint')}</p>
        <p className="text-xs text-muted-foreground">{t('capabilities.externalEmpty')}</p>
      </section>
    </div>
  );
}
