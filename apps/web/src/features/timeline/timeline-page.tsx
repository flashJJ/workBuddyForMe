'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionEventScope, SessionEventView } from '@wbfm/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

interface TimelineItem {
  id: string;
  seq: number;
  scope: SessionEventScope;
  scopeId: string;
  type: string;
  label: string;
  detail: string;
  at: string;
  payload: unknown;
}

interface EventsResponse {
  events: SessionEventView[];
  items: TimelineItem[];
}

const SCOPES: SessionEventScope[] = ['chat', 'task', 'flow', 'agent'];

function readLocation(): { scope: string; scopeId: string } {
  if (typeof window === 'undefined') return { scope: '', scopeId: '' };
  const params = new URLSearchParams(window.location.search);
  return { scope: params.get('scope') ?? '', scopeId: params.get('id') ?? '' };
}

/** v2.9：事件时间线 + 全局检索 + 导出 */
export function TimelinePage() {
  const { t } = useI18n();
  const initial = readLocation();
  const [scope, setScope] = React.useState<SessionEventScope | ''>(
    SCOPES.includes(initial.scope as SessionEventScope) ? (initial.scope as SessionEventScope) : '',
  );
  const [scopeId, setScopeId] = React.useState(initial.scopeId);
  const [query, setQuery] = React.useState('');
  const [term, setTerm] = React.useState('');

  const timeline = useQuery({
    queryKey: QUERY_KEYS.events(scope || 'none', scopeId),
    queryFn: () => apiGet<EventsResponse>(API.events(scope, scopeId)),
    enabled: Boolean(scope && scopeId),
  });

  const search = useQuery({
    queryKey: QUERY_KEYS.eventSearch(term, scope),
    queryFn: () => apiGet<SessionEventView[]>(API.search(term, scope || undefined)),
    enabled: term.length > 0,
  });

  const openTimeline = (nextScope: SessionEventScope, nextId: string) => {
    setScope(nextScope);
    setScopeId(nextId);
    setTerm('');
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams({ scope: nextScope, id: nextId });
      window.history.replaceState(null, '', `/timeline?${params.toString()}`);
    }
  };

  const items = timeline.data?.items ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="timeline-page">
      <PageHeader
        title={t('timeline.title')}
        description={t('timeline.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!scope || !scopeId}
            onClick={() => {
              if (scope && scopeId) window.location.href = API.exportSession(scope, scopeId);
            }}
          >
            {t('timeline.export')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-36">
          <SimpleSelect
            value={scope}
            onValueChange={(value) => setScope(value as SessionEventScope | '')}
            aria-label={t('timeline.scope')}
          >
            <option value="">{t('timeline.scopes.all')}</option>
            {SCOPES.map((item) => (
              <option key={item} value={item}>
                {t(`timeline.scopes.${item}`)}
              </option>
            ))}
          </SimpleSelect>
        </div>
        <form
          className="flex min-w-[16rem] flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(query.trim());
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('timeline.searchPlaceholder')}
            aria-label={t('timeline.search')}
          />
          <Button type="submit" size="sm" disabled={!query.trim()}>
            {t('timeline.search')}
          </Button>
        </form>
      </div>

      {term ? (
        <section className="space-y-2" data-testid="timeline-search-results">
          {search.isLoading ? (
            <Spinner />
          ) : search.isError ? (
            <ErrorState message={t('timeline.searchFailed')} onRetry={() => void search.refetch()} />
          ) : (search.data ?? []).length === 0 ? (
            <EmptyState title={t('timeline.searchEmpty')} />
          ) : (
            (search.data ?? []).map((event) => (
              <button
                key={event.id}
                type="button"
                className="flex w-full flex-col gap-1 rounded-lg border bg-card p-3 text-left hover:bg-muted"
                onClick={() => openTimeline(event.scope, event.scopeId)}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{t(`timeline.scopes.${event.scope}`)}</Badge>
                  <span className="font-medium">{event.type}</span>
                  <span className="text-xs text-muted-foreground">{event.createdAt}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.scopeId} · {t('timeline.open')}
                </span>
              </button>
            ))
          )}
        </section>
      ) : scope && scopeId ? (
        <section className="space-y-2" data-testid="timeline-events">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {scope} / {scopeId} · {items.length} {t('timeline.events')}
            </span>
            <span>{t('timeline.exportHint')}</span>
          </div>
          {timeline.isLoading ? (
            <Spinner />
          ) : timeline.isError ? (
            <ErrorState message={t('timeline.loadFailed')} onRetry={() => void timeline.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t('timeline.empty')} />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">#{item.seq}</Badge>
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.at}</span>
                  </div>
                  {item.detail && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {t('timeline.detail')}
                    </summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <EmptyState title={t('timeline.searchHint')} />
      )}
    </div>
  );
}
