'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KOKORO_VOICE_OPTIONS,
  type VrmAvatarListResponse,
  type VrmAvatarVoiceUpdate,
} from '@wbfm/shared/schemas';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiDelete, apiPatch } from '@/lib/api/client';
import { AvatarVoicePreview, useVoiceSettings } from '@/features/voice';
import { useToast } from '@/components/common/toast';
import { AssetList } from './asset-list';

const VOICE_GROUPS = [
  { key: 'english', labelKey: 'voice.vrmVoice.englishGroup' },
  { key: 'zh-female', labelKey: 'voice.vrmVoice.chineseFemaleGroup' },
  { key: 'zh-male', labelKey: 'voice.vrmVoice.chineseMaleGroup' },
] as const;

/** 已导入 VRM 列表管理：删除 + Kokoro 声线绑定/试听 */
export function VrmAvatarList() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { settings, modelStatus } = useVoiceSettings();

  const { data, isLoading } = useVisibleQuery({
    queryKey: ['vrm-avatars'],
    queryFn: () => apiGet<VrmAvatarListResponse>('/api/vrm-avatars'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/vrm-avatars/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vrm-avatars'] });
    },
  });

  const voiceMutation = useMutation({
    mutationFn: (input: VrmAvatarVoiceUpdate & { id: string }) =>
      apiPatch(`/api/vrm-avatars/${input.id}`, { voiceSid: input.voiceSid }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vrm-avatars'] });
    },
    onError: () => toast.error(t('voice.vrmVoice.saveFailed')),
  });

  const avatars = data?.avatars ?? [];
  const kokoroReady = !!modelStatus?.ttsModels.find((item) => item.model === 'kokoro')?.ready;

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
        secondary: (
          <div className="mt-1 space-y-1">
            <div>
              {avatar.meta.author ?? 'unknown'} · {Math.round(avatar.byteLength / 1024)}KB
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{t('voice.vrmVoice.label')}</span>
              <select
                className="h-7 rounded-md border bg-ui-control px-1.5 text-xs"
                data-testid={`vrm-voice-${avatar.id}`}
                value={avatar.voiceSid === null ? '' : String(avatar.voiceSid)}
                disabled={voiceMutation.isPending}
                onChange={(event) => {
                  const value = event.target.value;
                  voiceMutation.mutate({
                    id: avatar.id,
                    voiceSid: value === '' ? null : Number(value),
                  });
                }}
              >
                <option value="">{t('voice.vrmVoice.followDefault')}</option>
                {VOICE_GROUPS.map((group) => (
                  <optgroup key={group.key} label={t(group.labelKey)}>
                    {KOKORO_VOICE_OPTIONS.filter((option) => option.group === group.key).map(
                      (option) => (
                        <option key={option.sid} value={option.sid}>
                          {option.voice}
                        </option>
                      ),
                    )}
                  </optgroup>
                ))}
              </select>
              <AvatarVoicePreview sid={avatar.voiceSid ?? 3} ready={kokoroReady} />
            </div>
            {settings && settings.ttsModel !== 'kokoro' && (
              <div className="text-[11px] text-muted-foreground">{t('voice.vrmVoice.hint')}</div>
            )}
          </div>
        ),
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
