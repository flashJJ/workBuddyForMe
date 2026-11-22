'use client';

import * as React from 'react';
import type {
  VoiceCloudCredentialsView,
  VoiceSettings,
  VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError, apiGet, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useVoiceSettings } from '../../use-voice-settings';

const SAMPLE_RATE_OPTIONS = [16000, 24000, 8000] as const;

/**
 * 腾讯云在线 TTS：凭据（SecretId/SecretKey）密文保存，设置项即时生效。
 * 凭据不随 VoiceSettings 下发；GET 只返回脱敏状态。
 */
export function CloudTtsSection(props: {
  settings: VoiceSettings;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}) {
  const { settings, onPatch } = props;
  const { t } = useI18n();
  const toast = useToast();
  const { refreshModelStatus } = useVoiceSettings();
  const [view, setView] = React.useState<VoiceCloudCredentialsView | null>(null);
  const [secretId, setSecretId] = React.useState('');
  const [secretKey, setSecretKey] = React.useState('');
  const [region, setRegion] = React.useState(settings.tencentRegion);
  const [voiceType, setVoiceType] = React.useState(String(settings.tencentVoiceType));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    void apiGet<VoiceCloudCredentialsView>(API.voiceCloudCredentials)
      .then(setView)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => setRegion(settings.tencentRegion), [settings.tencentRegion]);
  React.useEffect(
    () => setVoiceType(String(settings.tencentVoiceType)),
    [settings.tencentVoiceType],
  );

  const saveCredentials = async () => {
    if (!secretId.trim() || !secretKey.trim()) {
      toast.error(t('voice.cloud.needKeys'));
      return;
    }
    setSaving(true);
    try {
      const next = await apiPut<VoiceCloudCredentialsView>(API.voiceCloudCredentials, {
        secretId: secretId.trim(),
        secretKey: secretKey.trim(),
        region: region.trim(),
      });
      setView(next);
      setSecretId('');
      setSecretKey('');
      toast.success(t('voice.cloud.saved'));
      refreshModelStatus();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('voice.cloud.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const clearCredentials = async () => {
    setSaving(true);
    try {
      const next = await apiPut<VoiceCloudCredentialsView>(API.voiceCloudCredentials, {
        clear: true,
      });
      setView(next);
      toast.success(t('voice.cloud.cleared'));
      refreshModelStatus();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('voice.cloud.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-ui-row p-3" data-testid="voice-cloud-section">
      <div>
        <p className="text-sm font-medium">{t('voice.cloud.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('voice.cloud.description')}</p>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="voice-cloud-status">
        {view?.hasCredentials
          ? t('voice.cloud.statusConfigured', {
              secretId: view.maskedSecretId ?? '',
              region: view.region,
            })
          : t('voice.cloud.statusMissing')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tencent-secret-id">{t('voice.cloud.secretIdLabel')}</Label>
          <input
            id="tencent-secret-id"
            type="password"
            autoComplete="off"
            className="h-9 w-full rounded-md border bg-ui-control px-3 text-sm"
            value={secretId}
            onChange={(e) => setSecretId(e.target.value)}
            placeholder={view?.hasCredentials ? t('voice.cloud.keepPlaceholder') : ''}
            data-testid="tencent-secret-id"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tencent-secret-key">{t('voice.cloud.secretKeyLabel')}</Label>
          <input
            id="tencent-secret-key"
            type="password"
            autoComplete="off"
            className="h-9 w-full rounded-md border bg-ui-control px-3 text-sm"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={view?.hasCredentials ? t('voice.cloud.keepPlaceholder') : ''}
            data-testid="tencent-secret-key"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tencent-region">{t('voice.cloud.regionLabel')}</Label>
          <input
            id="tencent-region"
            className="h-9 w-full rounded-md border bg-ui-control px-3 text-sm"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="ap-guangzhou"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tencent-voice-type">{t('voice.cloud.voiceTypeLabel')}</Label>
          <input
            id="tencent-voice-type"
            type="number"
            min={0}
            className="h-9 w-full rounded-md border bg-ui-control px-3 text-sm"
            value={voiceType}
            onChange={(e) => setVoiceType(e.target.value)}
            onBlur={() => {
              const parsed = Number(voiceType);
              if (Number.isInteger(parsed) && parsed >= 0) {
                void onPatch({ tencentVoiceType: parsed });
              } else {
                setVoiceType(String(settings.tencentVoiceType));
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tencent-sample-rate">{t('voice.cloud.sampleRateLabel')}</Label>
          <SimpleSelect
            id="tencent-sample-rate"
            value={String(settings.tencentSampleRate)}
            onValueChange={(value) =>
              void onPatch({
                tencentSampleRate: Number(value) as 8000 | 16000 | 24000,
              })
            }
          >
            {SAMPLE_RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate / 1000} kHz
              </option>
            ))}
          </SimpleSelect>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void saveCredentials()}
          data-testid="tencent-save"
        >
          {saving ? t('voice.cloud.saving') : t('voice.cloud.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || !view?.hasCredentials}
          onClick={() => void clearCredentials()}
        >
          {t('voice.cloud.clear')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('voice.cloud.note')}</p>
    </div>
  );
}
