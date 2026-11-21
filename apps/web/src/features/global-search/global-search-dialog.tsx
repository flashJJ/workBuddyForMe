'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/common/state';
import { SEARCH_DOMAINS, type SearchDomain } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useGlobalSearch } from './use-global-search';
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from './lib';
import type { GlobalSearchHit } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHit: (hit: GlobalSearchHit) => void;
}

/** v4.18：全局检索弹层（五域、过滤器、最近搜索与键盘操作） */
export function GlobalSearchDialog({ open, onOpenChange, onOpenHit }: Props) {
  const { t } = useI18n();
  const [domain, setDomain] = React.useState<SearchDomain | 'all'>('all');
  const [recent, setRecent] = React.useState<string[]>([]);
  const { query, setQuery, groups, failedDomains, loading } = useGlobalSearch(open, domain);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [active, setActive] = React.useState(0);

  const flat = React.useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      setDomain('all');
      return;
    }
    setRecent(readRecentSearches(window.localStorage));
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, setQuery]);

  React.useEffect(() => {
    setActive(0);
  }, [query, groups, domain]);

  const trimmed = query.trim();
  const showEmpty = !loading && trimmed.length >= 2 && flat.length === 0;
  const showRecent = !trimmed && recent.length > 0;

  const openHit = (hit: GlobalSearchHit, newPanel = false) => {
    setRecent(rememberSearch(window.localStorage, trimmed));
    onOpenChange(false);
    if (newPanel) {
      window.open(hit.deepLink, '_blank', 'noopener');
      return;
    }
    onOpenHit(hit);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (flat.length === 0 ? 0 : (prev + 1) % flat.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (flat.length === 0 ? 0 : (prev - 1 + flat.length) % flat.length));
      return;
    }
    if (event.key === 'Enter' && flat[active]) {
      event.preventDefault();
      openHit(flat[active], event.ctrlKey || event.metaKey);
    }
  };

  const filters: Array<SearchDomain | 'all'> = ['all', ...SEARCH_DOMAINS];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="global-search-dialog" onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('chatMessages.search.title')}</DialogTitle>
          <DialogDescription>{t('chatMessages.search.localOnly')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="pl-8"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('chatMessages.search.placeholder')}
              aria-label={t('chatMessages.search.placeholder')}
              data-testid="global-search-input"
            />
          </div>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={t('chatMessages.search.filterLabel')}
          >
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  domain === item
                    ? 'border-primary/50 bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                aria-pressed={domain === item}
                data-testid={`global-search-filter-${item}`}
                onClick={() => setDomain(item)}
              >
                {item === 'all'
                  ? t('chatMessages.search.scopeAll')
                  : t(`chatMessages.search.domains.${item}`)}
              </button>
            ))}
          </div>
          <div className="max-h-96 min-h-16 overflow-y-auto" data-testid="global-search-results">
            {loading ? <Spinner /> : null}
            {showRecent ? (
              <div className="py-2" data-testid="global-search-recent">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('chatMessages.search.recentTitle')}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      clearRecentSearches(window.localStorage);
                      setRecent([]);
                    }}
                  >
                    {t('chatMessages.search.recentClear')}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 px-1">
                  {recent.map((term) => (
                    <button
                      key={term}
                      type="button"
                      className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
                      onClick={() => setQuery(term)}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {showEmpty ? (
              <div className="py-6 text-center">
                <p className="text-sm">{t('chatMessages.search.empty')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {domain === 'all'
                    ? t('chatMessages.search.emptyHint')
                    : t('chatMessages.search.emptyCurrentDomain')}
                </p>
              </div>
            ) : null}
            {groups.map((group) => (
              <section key={group.domain} className="mb-3" data-testid={`global-search-group-${group.domain}`}>
                <h4 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`chatMessages.search.domains.${group.domain}`)}
                </h4>
                <ul className="space-y-1">
                  {group.hits.map((hit) => {
                    const index = flat.indexOf(hit);
                    return (
                      <li key={`${hit.domain}:${hit.id}`}>
                        <button
                          type="button"
                          className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                            index === active
                              ? 'border-primary/50 bg-accent/60'
                              : 'bg-ui-row hover:border-primary/40 hover:bg-accent/40'
                          }`}
                          onClick={() => openHit(hit)}
                          onDoubleClick={() => openHit(hit, true)}
                          data-testid={`global-search-hit-${hit.domain}`}
                          aria-selected={index === active}
                        >
                          <span className="block truncate text-sm leading-snug">{hit.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {hit.snippet}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {hit.timestamp ? new Date(hit.timestamp).toLocaleString() : '—'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {failedDomains.length > 0 ? (
              <p className="px-1 py-1 text-xs text-destructive" data-testid="global-search-failed">
                {failedDomains
                  .map((item) => t(`chatMessages.search.domains.${item}`))
                  .join(' / ')}
                ：{t('chatMessages.search.failed')}
              </p>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('chatMessages.search.keyboardHint')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
