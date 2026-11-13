'use client';

import * as React from 'react';
import type { PetScriptJournalDay } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';

/** P8.6：按日期拉取剧情日记（date 为本地 YYYY-MM-DD） */
export function usePetJournal(date: string) {
  const [data, setData] = React.useState<PetScriptJournalDay | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<PetScriptJournalDay>(`/api/pet/script/journal?date=${date}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
