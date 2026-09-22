'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useProviders } from '@/lib/hooks/use-providers';
import { ProviderCard } from './provider-card';
import { ProviderFormDialog } from './provider-form-dialog';
import { DefaultsPanel } from './defaults-panel';
import { BackupPanel } from './backup-panel';

export function SettingsPage() {
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
        title="设置"
        description="管理模型供应商、默认模型与本地偏好，所有数据仅保存在本机。"
        actions={
          <Button type="button" onClick={openCreate}>
            新增供应商
          </Button>
        }
      />

      {isLoading && <Spinner />}
      {isError && <ErrorState message="供应商加载失败" onRetry={() => void refetch()} />}
      {!isLoading && !isError && providers && (
        <div className="space-y-4" data-testid="provider-list">
          {providers.length === 0 && (
            <EmptyState
              title="还没有模型供应商"
              description="新增一个 OpenAI 兼容服务，添加模型后即可开始对话。"
              action={
                <Button type="button" onClick={openCreate}>
                  去新增
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

      <BackupPanel />

      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={editing}
      />
    </div>
  );
}
