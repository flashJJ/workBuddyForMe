'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import type { PetScriptJournalDay, PetScriptJournalItem } from '@wbfm/shared/schemas';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { PageHeader, PageShell } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Language } from '@wbfm/shared/constants';
import { useI18n } from '@/lib/i18n/use-i18n';
import { usePetJournal } from './use-pet-journal';

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 只做整日偏移，避免夏令时/时区把结果带到前一天 */
function shiftDate(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
}

function formatTime(ms: number, locale: Language): string {
  return new Date(ms).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function JournalRow({ item, locale }: { item: PetScriptJournalItem; locale: Language }) {
  const { t } = useI18n();
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.theme || t('pet.journal.noTheme')}
          </p>
        </div>
        <Badge variant="outline">
          {item.source === 'auto' ? t('pet.journal.sourceAuto') : t('pet.journal.sourceManual')}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t('pet.journal.generatedAt', { time: formatTime(item.generatedAt, locale) })}</span>
        <span>
          {item.playCount > 0
            ? t('pet.journal.playTimes', { count: item.playCount })
            : t('pet.journal.neverPlayed')}
        </span>
        {item.playedAt ? (
          <span>{t('pet.journal.playedAt', { time: formatTime(item.playedAt, locale) })}</span>
        ) : null}
      </div>
    </li>
  );
}

function JournalDay({ day, locale }: { day: PetScriptJournalDay; locale: Language }) {
  const { t } = useI18n();
  if (day.items.length === 0) {
    return (
      <EmptyState
        title={t('pet.journal.emptyTitle')}
        description={t('pet.journal.emptyHint')}
        icon={<NotebookPen className="h-5 w-5" />}
      />
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">{t('pet.journal.generatedCount', { count: day.generated })}</Badge>
        <Badge variant="success">{t('pet.journal.playedCount', { count: day.played })}</Badge>
      </div>
      <ul className="space-y-2">
        {day.items.map((item) => (
          <JournalRow key={item.sceneId} item={item} locale={locale} />
        ))}
      </ul>
    </>
  );
}

/** P8.6 日常回顾：某天生成了哪些剧情、演了几场 */
export function PetJournalPage() {
  const { t, locale } = useI18n();
  const today = React.useMemo(() => dateKey(new Date()), []);
  const [date, setDate] = React.useState(today);
  const { data, loading, error, reload } = usePetJournal(date);
  const isToday = date === today;

  return (
    <PageShell
      header={
        <PageHeader
          title={t('pet.journal.title')}
          description={t('pet.journal.description')}
          icon={<NotebookPen className="h-5 w-5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t('pet.journal.prevDay')}
                onClick={() => setDate(shiftDate(date, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                className="h-8 w-40"
                aria-label={t('pet.journal.pickDate')}
                value={date}
                max={today}
                onChange={(event) => {
                  if (event.target.value) setDate(event.target.value);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t('pet.journal.nextDay')}
                disabled={isToday}
                onClick={() => setDate(shiftDate(date, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isToday && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDate(today)}>
                  {t('pet.journal.today')}
                </Button>
              )}
            </div>
          }
        />
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {loading ? <Spinner label={t('pet.journal.loading')} /> : null}
        {!loading && error ? (
          <ErrorState message={t('pet.journal.loadFail')} description={error} onRetry={reload} />
        ) : null}
        {!loading && !error && data ? <JournalDay day={data} locale={locale} /> : null}
      </div>
    </PageShell>
  );
}
