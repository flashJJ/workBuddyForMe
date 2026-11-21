'use client';

import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { ProviderHealthReport } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v4.19：供应商健康度（只读；按天窗口） */
export function useProviderHealth(days = 7) {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.providerHealth(days),
    queryFn: () => apiGet<ProviderHealthReport>(`${API.providerHealth}?days=${days}`),
  });
}
