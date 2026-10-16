'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiDelete } from '@/lib/api/client';
import type { VrmAvatar, VrmAvatarListResponse } from '@wbfm/shared/schemas';

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

  const onDelete = (avatar: VrmAvatar) => {
    if (!window.confirm(t('avatar.vrm.deleteConfirm', { name: avatar.name }))) return;
    deleteMutation.mutate(avatar.id);
  };

  const avatars = data?.avatars ?? [];

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="vrm-avatar-list">
      <div>
        <h4 className="text-sm font-medium">{t('avatar.vrm.sectionTitle')}</h4>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!isLoading && avatars.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('avatar.vrm.empty')}</p>
      )}
      {avatars.length > 0 && (
        <ul className="space-y-2">
          {avatars.map((avatar) => (
            <li
              key={avatar.id}
              className="flex items-center justify-between rounded border p-2 text-xs"
              data-testid={`vrm-avatar-row-${avatar.id}`}
            >
              <div>
                <div className="font-medium">{avatar.name}</div>
                <div className="text-muted-foreground">
                  {avatar.meta.author ?? 'unknown'} · {Math.round(avatar.byteLength / 1024)}KB
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
                data-testid={`vrm-avatar-delete-${avatar.id}`}
                onClick={() => onDelete(avatar)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
