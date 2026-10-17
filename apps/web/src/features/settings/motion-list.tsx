'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n/use-i18n';
import { apiGet, apiDelete, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import {
  buildMotionId,
  parseMotionId,
  type MotionAssetListResponse,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import {
  MOTION_ROTATION_SECONDS_DEFAULT,
  MOTION_ROTATION_SECONDS_MAX,
  MOTION_ROTATION_SECONDS_MIN,
} from '@wbfm/shared/constants';
import { AssetList } from './asset-list';

/** 已导入待机动作列表管理：轮播设置 / 设为待机 / 恢复内置 / 删除 */
export function MotionList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['motions'],
    queryFn: () => apiGet<MotionAssetListResponse>('/api/motions'),
  });

  /** 轮播配置属语音设置域 */
  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.voiceSettings,
    queryFn: () => apiGet<VoiceSettings>(API.voiceSettings),
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['motions'] });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voiceSettings });
  };

  /** idleMotionId 与轮播配置属语音设置域，经 /api/voice/settings 落库 */
  const patchMutation = useMutation({
    mutationFn: (patch: VoiceSettingsUpdateInput) => apiPut(API.voiceSettings, patch),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/motions/${id}`),
    onSuccess: invalidate,
  });

  const rotationEnabled = settings?.motionRotationEnabled ?? true;
  const [secondsDraft, setSecondsDraft] = React.useState(
    String(settings?.motionRotationSeconds ?? MOTION_ROTATION_SECONDS_DEFAULT),
  );
  React.useEffect(() => {
    if (settings) setSecondsDraft(String(settings.motionRotationSeconds));
  }, [settings?.motionRotationSeconds]);

  const commitSeconds = () => {
    const parsed = Number.parseInt(secondsDraft, 10);
    const seconds = Number.isInteger(parsed)
      ? Math.min(MOTION_ROTATION_SECONDS_MAX, Math.max(MOTION_ROTATION_SECONDS_MIN, parsed))
      : MOTION_ROTATION_SECONDS_DEFAULT;
    setSecondsDraft(String(seconds));
    if (seconds !== settings?.motionRotationSeconds) {
      patchMutation.mutate({ motionRotationSeconds: seconds });
    }
  };

  const motions = data?.motions ?? [];
  const selectedRef = parseMotionId(data?.selectedId ?? null);
  const currentName = selectedRef
    ? (motions.find((m) => m.fileRef === selectedRef)?.name ?? selectedRef)
    : t('avatar.motion.builtinName');

  const onDelete = (id: string, name: string) => {
    if (!window.confirm(t('avatar.motion.deleteConfirm', { name }))) return;
    deleteMutation.mutate(id);
  };

  return (
    <AssetList
      sectionTitleKey="avatar.motion.sectionTitle"
      emptyKey="avatar.motion.empty"
      testId="motion-list"
      isLoading={isLoading}
      headerExtra={
        <span className="text-xs text-muted-foreground">
          {t('avatar.motion.currentIdle')}: {currentName}
        </span>
      }
      beforeList={
        <>
          <div className="space-y-2 rounded border p-2 text-xs" data-testid="motion-rotation">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                data-testid="motion-rotation-toggle"
                checked={rotationEnabled}
                disabled={patchMutation.isPending}
                onChange={(e) => patchMutation.mutate({ motionRotationEnabled: e.target.checked })}
              />
              <span className="font-medium">{t('avatar.motion.rotationLabel')}</span>
            </label>
            <p className="text-muted-foreground">{t('avatar.motion.rotationHint')}</p>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('avatar.motion.rotationSeconds')}</span>
              <input
                type="number"
                min={MOTION_ROTATION_SECONDS_MIN}
                max={MOTION_ROTATION_SECONDS_MAX}
                className="w-16 rounded-md border px-2 py-1 text-xs"
                data-testid="motion-rotation-seconds"
                value={secondsDraft}
                disabled={patchMutation.isPending || !rotationEnabled}
                onChange={(e) => setSecondsDraft(e.target.value)}
                onBlur={commitSeconds}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSeconds();
                }}
              />
            </label>
          </div>

          <div
            className="flex items-center justify-between rounded border p-2 text-xs"
            data-testid="motion-builtin-row"
          >
            <div>
              <div className="font-medium">{t('avatar.motion.builtinName')}</div>
              {!selectedRef && (
                <div className="text-muted-foreground">{t('avatar.motion.currentIdle')}</div>
              )}
            </div>
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              data-testid="motion-reset-builtin"
              disabled={!selectedRef || patchMutation.isPending}
              onClick={() => patchMutation.mutate({ idleMotionId: null })}
            >
              {t('avatar.motion.resetToBuiltin')}
            </button>
          </div>
        </>
      }
      rows={motions.map((motion) => {
        const isCurrent = selectedRef === motion.fileRef;
        return {
          key: motion.id,
          testId: `motion-row-${motion.id}`,
          primary: motion.name,
          secondary: `${Math.round(motion.byteLength / 1024)}KB`,
          actions: (
            <>
              {isCurrent ? (
                <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">
                  {t('avatar.motion.currentIdle')}
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  data-testid={`motion-set-idle-${motion.id}`}
                  disabled={patchMutation.isPending}
                  onClick={() =>
                    patchMutation.mutate({ idleMotionId: buildMotionId(motion.fileRef) })
                  }
                >
                  {t('avatar.motion.setAsIdle')}
                </button>
              )}
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
                data-testid={`motion-delete-${motion.id}`}
                onClick={() => onDelete(motion.id, motion.name)}
              >
                删除
              </button>
            </>
          ),
        };
      })}
    />
  );
}
