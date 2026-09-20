'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useProviderMutations } from '@/lib/hooks/use-providers';
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
  const mutations = useProviderMutations();
  const toast = useToast();
  const [testState, setTestState] = React.useState<TestState>({ status: 'idle' });

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await mutations.update.mutateAsync({ id: provider.id, body: { enabled } });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '更新失败');
    }
  };

  const runTest = async () => {
    setTestState({ status: 'running' });
    try {
      await mutations.testConnection.mutateAsync(provider.id);
      setTestState({ status: 'success' });
    } catch (error) {
      setTestState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : '连接失败',
      });
    }
  };

  const remove = async () => {
    if (!window.confirm(`确定删除供应商「${provider.name}」及其模型配置？`)) return;
    try {
      await mutations.remove.mutateAsync(provider.id);
      toast.success('供应商已删除');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '删除失败');
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4" data-testid={`provider-card-${provider.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{provider.name}</h3>
            {provider.enabled ? (
              <Badge variant="success">已启用</Badge>
            ) : (
              <Badge variant="outline">已停用</Badge>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{provider.baseUrl}</p>
          <p className="text-xs text-muted-foreground">
            Key：{provider.apiKeyMasked ?? '未配置'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <label className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              aria-label={`启用 ${provider.name}`}
            />
            启用
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => void runTest()}>
            {testState.status === 'running' ? '测试中…' : '测试连接'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(provider)}>
            编辑
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void remove()}>
            删除
          </Button>
        </div>
      </div>

      <div className="mt-2 min-h-5 text-sm" role="status" data-testid={`test-result-${provider.id}`}>
        {testState.status === 'success' && <span className="text-emerald-600">连接成功</span>}
        {testState.status === 'error' && (
          <span className="text-red-600">连接失败：{testState.message}</span>
        )}
      </div>

      <ModelManager provider={provider} />
    </section>
  );
}
