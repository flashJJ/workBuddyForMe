'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  AUDIT_EVENT_KINDS,
  type AuditEventKind,
  type AuditEventView,
  type AuditVerifyResult,
  type AuditActor,
  type AuditDecision,
} from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { AuditArchiveActions } from './audit-archive-actions';

/**
 * v2.13 M3 审计页：链状态 + 过滤 + 详情 + JSONL 导出。
 * 账本只读，页面不提供任何删除 / 修改入口。
 */

const KIND_KEYS: Record<AuditEventKind, MessageKey> = {
  policy_updated: 'audit.kinds.policy_updated',
  policy_denied: 'audit.kinds.policy_denied',
  approval_requested: 'audit.kinds.approval_requested',
  approval_granted: 'audit.kinds.approval_granted',
  approval_denied: 'audit.kinds.approval_denied',
  approval_timeout: 'audit.kinds.approval_timeout',
  binding_drift: 'audit.kinds.binding_drift',
  run_started: 'audit.kinds.run_started',
  run_finished: 'audit.kinds.run_finished',
  scheduled_run_started: 'audit.kinds.scheduled_run_started',
  scheduled_run_finished: 'audit.kinds.scheduled_run_finished',
  unattended_blocked: 'audit.kinds.unattended_blocked',
  skill_version_deleted: 'audit.kinds.skill_version_deleted',
  secrets_rotated: 'audit.kinds.secrets_rotated',
  audit_verified: 'audit.kinds.audit_verified',
};

const ACTOR_KEYS: Record<AuditActor, MessageKey> = {
  user: 'audit.actors.user',
  agent: 'audit.actors.agent',
  system: 'audit.actors.system',
};

const DECISION_KEYS: Record<AuditDecision, MessageKey> = {
  allow: 'audit.decisions.allow',
  deny: 'audit.decisions.deny',
  ask: 'audit.decisions.ask',
};

const DECISION_VARIANT: Record<AuditDecision, 'success' | 'danger' | 'warning'> = {
  allow: 'success',
  deny: 'danger',
  ask: 'warning',
};

interface Filters {
  kind: string;
  runId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { kind: '', runId: '', from: '', to: '' };

/** v2.14：runId 过滤与地址栏同步（清空即移除参数） */
function syncRunIdParam(runId: string): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (runId.trim()) params.set('runId', runId.trim());
  else params.delete('runId');
  const query = params.toString();
  window.history.replaceState(null, '', `/audit${query ? `?${query}` : ''}`);
}

function buildPath(filters: Filters): string {
  const params = new URLSearchParams({ limit: '100' });
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.runId.trim()) params.set('runId', filters.runId.trim());
  if (filters.from) params.set('from', new Date(filters.from).toISOString());
  if (filters.to) params.set('to', new Date(filters.to).toISOString());
  return `${API.auditEvents}?${params.toString()}`;
}

function EventRow({ event }: { event: AuditEventView }) {
  const { t } = useI18n();
  return (
    <li className="space-y-2 rounded-lg border bg-card p-4" data-testid={`audit-event-${event.seq}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">#{event.seq}</Badge>
        <Badge variant={event.actor === 'system' ? 'default' : 'info'}>
          {t(ACTOR_KEYS[event.actor])}
        </Badge>
        <span className="text-sm font-medium">{t(KIND_KEYS[event.kind])}</span>
        {event.decision && (
          <Badge variant={DECISION_VARIANT[event.decision]}>
            {t(DECISION_KEYS[event.decision])}
          </Badge>
        )}
        {event.tool && <Badge variant="outline">{event.tool}</Badge>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{new Date(event.createdAt).toLocaleString()}</span>
        {event.runId ? (
          <span className="inline-flex items-center gap-1">
            run: {event.runId}
            <a
              href={`/timeline?scope=task&id=${encodeURIComponent(event.runId)}`}
              className="text-primary underline-offset-2 hover:underline"
              data-testid={`audit-view-task-${event.seq}`}
            >
              {t('audit.viewTask')}
            </a>
          </span>
        ) : null}
        {!event.runId && <span>{t('audit.noContext')}</span>}
        {event.reasonCode && (
          <span>
            {t('audit.reason')}: {event.reasonCode}
          </span>
        )}
      </div>
      {event.outcome && <p className="text-xs text-muted-foreground">{event.outcome}</p>}
      {(event.binding || event.policyHash || event.hash) && (
        <details className="rounded-md border bg-muted/30 p-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('audit.detail')}</summary>
          <div className="mt-2 space-y-1 break-all">
            {event.policyHash && (
              <p>
                {t('audit.policyHash')}: {event.policyHash}
              </p>
            )}
            {event.binding && (
              <p>
                {t('audit.binding')}: {JSON.stringify(event.binding)}
              </p>
            )}
            <p>
              {t('audit.hash')}: {event.hash}
            </p>
            <p>
              {t('audit.prevHash')}: {event.prevHash}
            </p>
          </div>
        </details>
      )}
    </li>
  );
}

export function AuditPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const initialRunId = searchParams.get('runId') ?? '';
  const [draft, setDraft] = React.useState<Filters>({ ...EMPTY_FILTERS, runId: initialRunId });
  const [filters, setFilters] = React.useState<Filters>({ ...EMPTY_FILTERS, runId: initialRunId });
  const queryKey = QUERY_KEYS.audit({ ...filters });

  const events = useQuery({
    queryKey,
    queryFn: () => apiGet<{ events: AuditEventView[]; nextCursor: number | null }>(buildPath(filters)),
  });

  const verify = useQuery({
    queryKey: ['audit', 'verify'],
    queryFn: () => apiPost<AuditVerifyResult>(API.auditVerify),
    staleTime: 30_000,
  });

  const apply = () => {
    setFilters(draft);
    syncRunIdParam(draft.runId);
  };
  const reset = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    syncRunIdParam('');
  };
  const exportLedger = () => {
    window.location.href = API.auditExport();
  };

  const patch = (next: Partial<Filters>) => setDraft((current) => ({ ...current, ...next }));

  return (
    <div className="space-y-4 p-4" data-testid="audit-page">
      <PageHeader
        title={t('audit.title')}
        description={t('audit.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void events.refetch()}>
              {t('audit.refresh')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void verify.refetch()}
              disabled={verify.isFetching}
            >
              {verify.isFetching ? t('audit.verifying') : t('audit.verify')}
            </Button>
            <Button size="sm" onClick={exportLedger}>
              {t('audit.export')}
            </Button>
            <AuditArchiveActions from={filters.from} to={filters.to} />
          </div>
        }
      />

      {verify.data && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            verify.data.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
          data-testid="audit-chain-status"
        >
          {verify.data.ok
            ? t('audit.chainOk', { count: String(verify.data.checked) })
            : t('audit.chainBroken', { seq: String(verify.data.firstBrokenSeq) })}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('audit.filters.kind')}
          <SimpleSelect value={draft.kind} onValueChange={(value) => patch({ kind: value })}>
            <option value="">{t('audit.filters.allKinds')}</option>
            {AUDIT_EVENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(KIND_KEYS[kind])}
              </option>
            ))}
          </SimpleSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('audit.filters.runId')}
          <input
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.runId}
            placeholder={t('audit.filters.runPlaceholder')}
            onChange={(event) => patch({ runId: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('audit.filters.from')}
          <input
            type="datetime-local"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.from}
            onChange={(event) => patch({ from: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('audit.filters.to')}
          <input
            type="datetime-local"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.to}
            onChange={(event) => patch({ to: event.target.value })}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button size="sm" onClick={apply}>
            {t('audit.filters.apply')}
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            {t('audit.filters.reset')}
          </Button>
        </div>
      </div>

      {events.isLoading ? (
        <Spinner />
      ) : events.isError ? (
        <ErrorState message={t('audit.error')} onRetry={() => void events.refetch()} />
      ) : (events.data?.events ?? []).length === 0 ? (
        <EmptyState title={filters.runId ? t('audit.emptyRun') : t('audit.empty')} />
      ) : (
        <ul className="space-y-3">
          {(events.data?.events ?? []).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
}
