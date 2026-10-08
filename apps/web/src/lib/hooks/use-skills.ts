'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SkillInfo } from '@wbfm/shared/types';
import type { SkillUpdateInput } from '@wbfm/shared/schemas';
import { apiDelete, apiGet, apiPatch } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 技能列表（设置页技能面板） */
export function useSkills() {
  return useQuery({
    queryKey: QUERY_KEYS.skills,
    queryFn: () => apiGet<SkillInfo[]>(API.skills),
  });
}

export function useSkillMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.skills });
  };

  return {
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SkillUpdateInput }) =>
        apiPatch<SkillInfo>(API.skill(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.skill(id)),
      onSuccess: invalidate,
    }),
  };
}
