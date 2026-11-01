'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiDelete } from '@/lib/api/client';
import type { VrmAvatarListResponse } from '@wbfm/shared/schemas';
import { AssetList } from './asset-list';

/** 已导入 VRM 列表管理 */
export function VrmAvatarList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vrm-avatars'],
    queryFn: () => apiGet<VrmAvatarListResponse>('/api/vrm-avatars'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/vrm-avatars/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vrm-avatars'] });
    },
  });

  const avatars = data?.avatars ?? [];

  return (
    <AssetList
      sectionTitleKey="avatar.vrm.sectionTitle"
      emptyKey="avatar.vrm.empty"
      testId="vrm-avatar-list"
      isLoading={isLoading}
      rows={avatars.map((avatar) => ({
        key: avatar.id,
        testId: `vrm-avatar-row-${avatar.id}`,
        primary: avatar.name,
        secondary: `${avatar.meta.author ?? 'unknown'} · ${Math.round(avatar.byteLength / 1024)}KB`,
        actions: (
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
            data-testid={`vrm-avatar-delete-${avatar.id}`}
            onClick={() => {
              if (!window.confirm(t('avatar.vrm.deleteConfirm', { name: avatar.name }))) return;
              deleteMutation.mutate(avatar.id);
            }}
          >
            删除
          </button>
        ),
      }))}
    />
  );
}
