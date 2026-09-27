'use client';

import * as React from 'react';
import type { ToolPermission } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useToolPermissions, useToolPermissionMutations } from '@/lib/hooks/use-permissions';

function formatScope(scope: string): string {
  if (scope === 'all') return '全局';
  if (scope.startsWith('assistant:')) return `助手 ${scope.slice('assistant:'.length)}`;
  return scope;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PermissionPanel() {
  const { data: permissions, isLoading } = useToolPermissions();
  const mutations = useToolPermissionMutations();
  const toast = useToast();

  const revoke = async (id: string) => {
    try {
      await mutations.revoke.mutateAsync(id);
      toast.success('已撤销授权');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '撤销失败');
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">工具权限</h2>
          <p className="text-sm text-muted-foreground">管理已授权的 write/danger 级工具调用权限</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!isLoading && (!permissions || permissions.length === 0) && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          暂无授权记录。write/danger 级工具首次被调用时，会在对话中弹出确认弹窗。
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
                  授权于 {formatDate(p.grantedAt)}
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
                撤销
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
