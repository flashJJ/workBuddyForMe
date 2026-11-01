'use client';

import { useQuery } from '@tanstack/react-query';
import type { EventDefinition } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

export interface InstalledEventScript {
  id: string;
  name: string;
  packId: string;
  definition: EventDefinition;
  phrases: string[];
}

/** v2.11：启用中的能力包剧本（短语触发；只读） */
export function useInstalledEventScripts(enabled: boolean) {
  return useQuery({
    queryKey: ['installed-event-scripts'],
    queryFn: () => apiGet<InstalledEventScript[]>(API.eventScripts),
    enabled,
    staleTime: 30_000,
  });
}
