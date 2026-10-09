'use client';

import * as React from 'react';
import type { ToolBreakerSnapshot } from '@wbfm/core/tools';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useToolBreakers, useToolBreakerMutations } from '@/lib/hooks/use-tool-breakers';

function formatStatus(status: ToolBreakerSnapshot['status']): { label: string; variant: 'warning' | 'danger' } {
  if (status === 'open') return { label: '熔断中', variant: 'danger' };
  return { label: '半开试探', variant: 'warning' };
}

function formatTrippedAt(iso: number | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ToolBreakerPanel() {
  const { data: breakers, isLoading } = useToolBreakers();
  const mutations = useToolBreakerMutations();
  const toast = useToast();

  const reset = async (name: string) => {
    try {
      await mutations.reset.mutateAsync(name);
      toast.success(`已重置 ${name} 的熔断状态`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '重置失败');
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">工具熔断器</h2>
          <p className="text-sm text-muted-foreground">
            连续失败达阈值的工具会自动短期跳过执行；冷却 5 分钟后自动半开重试。
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!isLoading && (!breakers || breakers.length === 0) && (
        <EmptyState
          title="暂无熔断工具"
          description="所有工具运行正常；连续失败的工具会在此展示并支持手动重置。"
        />
      )}

      {!isLoading && breakers && breakers.length > 0 && (
        <div className="space-y-2">
          {breakers.map((b) => {
            const { label, variant } = formatStatus(b.status);
            return (
              <div
                key={b.name}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                data-testid={`breaker-${b.name}`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 font-medium">
                    <code className="rounded bg-muted px-1 text-xs">{b.name}</code>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    连续失败 {b.failures} 次 · 熔断于 {formatTrippedAt(b.trippedAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutations.reset.isPending}
                  onClick={() => void reset(b.name)}
                  className="ml-2 shrink-0"
                >
                  重置
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
