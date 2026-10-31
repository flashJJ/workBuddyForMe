'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SkillVersionsResponse, SkillVersionDeleteResponse } from '@wbfm/shared/schemas';
import { apiDelete, apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.14：技能版本快照列表（面板展开时按需加载） */
export function useSkillVersions(name: string) {
  return useQuery({
    queryKey: QUERY_KEYS.skillVersions(name),
    queryFn: () => apiGet<SkillVersionsResponse>(API.skillVersions(name)),
  });
}

export function useSkillVersionRollback(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string) =>
      apiPost<SkillVersionsResponse>(API.skillVersionRollback(name, version)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.skillVersions(name) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.skills });
    },
  });
}

/** v2.15：删除非启用版本快照 */
export function useSkillVersionDelete(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string) =>
      apiDelete<SkillVersionDeleteResponse>(API.skillVersionDelete(name, version)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.skillVersions(name) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.skills });
    },
  });
}
