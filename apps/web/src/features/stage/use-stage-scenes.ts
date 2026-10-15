'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StageSceneCreateInput,
  StageSceneUpdateInput,
} from '@wbfm/shared/schemas';
import type { StageSceneRecord } from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export function useStageScenes() {
  return useQuery({
    queryKey: QUERY_KEYS.stageScenes,
    queryFn: () => apiGet<StageSceneRecord[]>(API.stageScenes),
  });
}

export function useStageSceneMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.stageScenes });
  return {
    create: useMutation({
      mutationFn: (input: StageSceneCreateInput) => apiPost<StageSceneRecord>(API.stageScenes, input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: StageSceneUpdateInput }) =>
        apiPatch<StageSceneRecord>(API.stageScene(id), input),
      onSuccess: invalidate,
    }),
    delete: useMutation({
      mutationFn: (id: string) => apiDelete(API.stageScene(id)),
      onSuccess: invalidate,
    }),
    /** 背景图上传：multipart file → fileRef */
    uploadBackground: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return apiUpload<{ fileRef: string }>(API.stageBackgrounds, form);
      },
    }),
  };
}
