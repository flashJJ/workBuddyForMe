'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkApproval } from '@wbfm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { useRouter } from 'next/navigation';

/**
 * v2.7 审批中心：聚合工具确认与 Flow 人工节点。
 * 只提供一次性允许/拒绝；remember 策略仍在原对话框处理。
 */
export function ApprovalsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEYS.approvals,
    queryFn: () => apiGet<{ approvals: WorkApproval[] }>(API.approvals),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'allow' | 'deny' }) =>
      apiPost<{ ok: boolean }>(API.approvalResolve(id), { action }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.approvals });
    },
    onError: () => setError(t('approvals.error')),
  });

  const handle = async (approval: WorkApproval, action: 'allow' | 'deny') => {
    setResolvingId(approval.id);
    try {
      await resolve.mutateAsync({ id: approval.id, action });
    } finally {
      setResolvingId(null);
    }
  };

  const approvals = query.data?.approvals ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="approvals-page">
      <PageHeader
        title={t('approvals.title')}
        description={t('approvals.description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('approvals.refresh')}
          </Button>
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState message={t('approvals.error')} onRetry={() => void query.refetch()} />
      ) : approvals.length === 0 ? (
        <EmptyState title={t('approvals.empty')} />
      ) : (
        <ul className="space-y-3">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="space-y-2 rounded-lg border bg-card p-4"
              data-testid={`approval-${approval.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={approval.source === 'flow' ? 'info' : 'warning'}>
                  {approval.source === 'flow'
                    ? t('approvals.sourceFlow')
                    : approval.source === 'desktop'
                      ? t('approvals.sourceDesktop')
                      : approval.source === 'subagent'
                        ? t('approvals.sourceSubagent')
                        : t('approvals.sourceTool')}
                </Badge>
                <span className="text-sm font-medium">{approval.title}</span>
                {approval.permission && (
                  <Badge variant="outline">{approval.permission}</Badge>
                )}
              </div>
              {approval.argsSummary && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {approval.argsSummary}
                </p>
              )}
              {approval.bindingSummary && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {t('approvals.binding')}：{approval.bindingSummary}
                </p>
              )}
              {approval.policyReason && (
                <p className="text-xs text-muted-foreground">
                  {t('approvals.policyReason')}：{approval.policyReason}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {approval.runId ? (
                  <span className="inline-flex items-center gap-1">
                    {t('approvals.run')}:
                    <a
                      href={`/timeline?scope=task&id=${encodeURIComponent(approval.runId)}`}
                      className="text-primary underline-offset-2 hover:underline"
                      data-testid={`approval-view-task-${approval.id}`}
                    >
                      {approval.runId}
                    </a>
                  </span>
                ) : (
                  t('approvals.noContext')
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void handle(approval, 'allow')}
                  disabled={resolvingId === approval.id}
                >
                  {resolvingId === approval.id ? t('approvals.processing') : t('approvals.allow')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void handle(approval, 'deny')}
                  disabled={resolvingId === approval.id}
                >
                  {t('approvals.deny')}
                </Button>
                {approval.deepLink && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(approval.deepLink)}
                  >
                    {t('approvals.open')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
