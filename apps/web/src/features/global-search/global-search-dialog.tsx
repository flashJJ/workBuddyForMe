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
import { useI18n } from '@/lib/i18n/use-i18n';
import { useGlobalSearch } from './use-global-search';
import type { GlobalSearchHit } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHit: (hit: GlobalSearchHit) => void;
}

/** v4.18：四域全局检索弹层（会话 / 任务 / 流程 / 会议） */
export function GlobalSearchDialog({ open, onOpenChange, onOpenHit }: Props) {
  const { t } = useI18n();
  const { query, setQuery, groups, failedDomains, loading } = useGlobalSearch(open);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [active, setActive] = React.useState(0);

  const flat = React.useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, setQuery]);

  React.useEffect(() => {
    setActive(0);
  }, [query, groups]);

  const trimmed = query.trim();
  const showEmpty = !loading && trimmed.length >= 2 && flat.length === 0;

  const openHit = (hit: GlobalSearchHit, newPanel = false) => {
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
          <div className="max-h-96 min-h-16 overflow-y-auto" data-testid="global-search-results">
            {loading ? <Spinner /> : null}
            {showEmpty ? (
              <div className="py-6 text-center">
                <p className="text-sm">{t('chatMessages.search.empty')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('chatMessages.search.emptyHint')}
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
                  .map((domain) => t(`chatMessages.search.domains.${domain}`))
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
