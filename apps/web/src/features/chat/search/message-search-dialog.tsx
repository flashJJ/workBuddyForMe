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
import { useMessageSearch, type MessageSearchHit } from './use-message-search';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHit: (hit: MessageSearchHit) => void;
}

/** v4.17：跨会话消息检索（本机 /api/search），点击结果跳到对应消息 */
export function MessageSearchDialog({ open, onOpenChange, onOpenHit }: Props) {
  const { t } = useI18n();
  const { query, setQuery, hits, loading, failed } = useMessageSearch(open);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, setQuery]);

  const trimmed = query.trim();
  const showEmpty = !loading && !failed && trimmed.length >= 2 && hits.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="message-search-dialog">
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
              data-testid="message-search-input"
            />
          </div>
          <div className="max-h-80 min-h-16 overflow-y-auto">
            {loading ? <Spinner /> : null}
            {failed ? (
              <p className="py-6 text-center text-xs text-destructive">
                {t('chatMessages.search.failed')}
              </p>
            ) : null}
            {showEmpty ? (
              <div className="py-6 text-center">
                <p className="text-sm">{t('chatMessages.search.empty')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('chatMessages.search.emptyHint')}
                </p>
              </div>
            ) : null}
            {!loading && hits.length > 0 ? (
              <ul className="space-y-1" data-testid="message-search-results">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border bg-ui-row px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                      onClick={() => onOpenHit(hit)}
                    >
                      <span className="text-[11px] uppercase text-muted-foreground">
                        {hit.role}
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug">{hit.snippet}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {new Date(hit.createdAt).toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
