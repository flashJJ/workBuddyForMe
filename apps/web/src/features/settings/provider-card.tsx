'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useProviderMutations } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ModelManager } from './model-manager';

interface Props {
  provider: Provider;
  onEdit: (provider: Provider) => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export function ProviderCard({ provider, onEdit }: Props) {
  const { t } = useI18n();
  const mutations = useProviderMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const [testState, setTestState] = React.useState<TestState>({ status: 'idle' });

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await mutations.update.mutateAsync({ id: provider.id, body: { enabled } });
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'settingsProviders.updateFailed' }));
    }
  };

  const runTest = async () => {
    setTestState({ status: 'running' });
    try {
      await mutations.testConnection.mutateAsync(provider.id);
      setTestState({ status: 'success' });
    } catch (error) {
      // 联调场景：错误码主文案后附加上游细节（如鉴权失败 401）
      setTestState({
        status: 'error',
        message: errorText(error, t, {
          fallback: 'settingsProviders.connectionFailed',
          withDetail: true,
        }),
      });
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: t('settingsProviders.deleteProviderTitle'),
        description: t('settingsProviders.deleteProviderConfirm', { name: provider.name }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(provider.id);
      toast.success(t('settingsProviders.providerDeleted'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'settingsProviders.deleteFailed' }));
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4" data-testid={`provider-card-${provider.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{provider.name}</h3>
            {provider.enabled ? (
              <Badge variant="success">{t('common.words.enabled')}</Badge>
            ) : (
              <Badge variant="outline">{t('common.words.disabled')}</Badge>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{provider.baseUrl}</p>
          <p className="text-xs text-muted-foreground">
            {t('settingsProviders.keyLabel', {
              key: provider.apiKeyMasked ?? t('settingsProviders.keyNotConfigured'),
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <label className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              aria-label={t('settingsProviders.enableProviderAria', { name: provider.name })}
            />
            {t('common.actions.enable')}
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => void runTest()}>
            {testState.status === 'running'
              ? t('settingsProviders.testing')
              : t('common.actions.testConnection')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(provider)}>
            {t('common.actions.edit')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void remove()}>
            {t('common.actions.delete')}
          </Button>
        </div>
      </div>

      <div className="mt-2 min-h-5 text-sm" role="status" data-testid={`test-result-${provider.id}`}>
        {testState.status === 'success' && (
          <span className="text-success">{t('settingsProviders.connectionSuccess')}</span>
        )}
        {testState.status === 'error' && (
          <span className="text-destructive">
            {t('settingsProviders.connectionFailedWith', { message: testState.message })}
          </span>
        )}
      </div>

      <ModelManager provider={provider} />
    </section>
  );
}
