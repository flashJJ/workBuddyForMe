'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useProviders } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ProviderCard } from './provider-card';
import { ProviderFormDialog } from './provider-form-dialog';
import { DefaultsPanel } from './defaults-panel';
import { McpPanel } from './mcp-panel';
import { PermissionPanel } from './permission-panel';
import { ToolBreakerPanel } from './tool-breaker-panel';
import { ToolDebugPanel } from './tool-debug-panel';
import { SkillsPanel } from './skills-panel';
import { MemoryPanel } from '../memory/memory-panel';
import { BackupPanel } from './backup-panel';
import { AboutPanel } from './about-panel';
import { HelpCenterPanel } from '../help-center/help-center-panel';
import { VoicePreferencePanel } from '../voice/settings/voice-preference-panel';

export function SettingsPage() {
  const { t } = useI18n();
  const { data: providers, isLoading, isError, refetch } = useProviders();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Provider | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditing(provider);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        actions={
          <Button type="button" onClick={openCreate}>
            {t('settings.addProvider')}
          </Button>
        }
      />

      {isLoading && <Spinner />}
      {isError && <ErrorState message={t('settings.loadError')} onRetry={() => void refetch()} />}
      {!isLoading && !isError && providers && (
        <div className="space-y-4" data-testid="provider-list">
          {providers.length === 0 && (
            <EmptyState
              title={t('settings.empty.title')}
              description={t('settings.empty.description')}
              action={
                <Button type="button" onClick={openCreate}>
                  {t('settings.empty.action')}
                </Button>
              }
            />
          )}
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} onEdit={openEdit} />
          ))}
        </div>
      )}

      <DefaultsPanel />

      <VoicePreferencePanel />

      <McpPanel />

      <PermissionPanel />

      <ToolBreakerPanel />

      <ToolDebugPanel />

      <SkillsPanel />

      <MemoryPanel />

      <BackupPanel />

      <HelpCenterPanel />

      <AboutPanel />

      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={editing}
      />
    </div>
  );
}
