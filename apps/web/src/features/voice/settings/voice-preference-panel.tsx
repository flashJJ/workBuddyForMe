'use client';

import * as React from 'react';
import { useVoiceSettings } from '../use-voice-settings';
import { useVoiceModelDownloads } from './use-voice-model-downloads';
import { VoiceModelCard } from './voice-model-card';
import { VoiceEngineParams } from './voice-engine-params';
import { VoiceInputSection } from './voice-input-section';
import { AvatarSection } from './avatar-section';
import { ProactiveSection } from './proactive-section';
import { MicSelfTest } from './mic-self-test';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError } from '@/lib/api/client';
import { apiGet } from '@/lib/api/client';

const HF_MIRROR = 'https://hf-mirror.com';
const HF_OFFICIAL = 'https://huggingface.co';

const TTS_DISPLAY_ORDER = ['kokoro', 'melo'] as const;

/** 模型下载管理（ASR 一张 + TTS 每引擎一张） */
function ModelDownloadSection() {
  const { t } = useI18n();
  const { modelStatus, settings } = useVoiceSettings();
  const downloads = useVoiceModelDownloads();
  // 语音状态接口异常/空响应时整个下载区降级不渲染（ttsModels 为必备字段）
  if (!modelStatus || !Array.isArray(modelStatus.ttsModels)) return null;

  const asrMeta = {
    name: t('voice.model.asr.name'),
    description: t('voice.model.asr.description'),
  };
  /** v1.1 两套 TTS 引擎的展示文案（顺序即设置页展示顺序：默认引擎在前） */
  const ttsMeta: Record<'melo' | 'kokoro', { name: string; description: string }> = {
    kokoro: {
      name: t('voice.model.tts.kokoro.name'),
      description: t('voice.model.tts.kokoro.description'),
    },
    melo: {
      name: t('voice.model.tts.melo.name'),
      description: t('voice.model.tts.melo.description'),
    },
  };

  return (
    <div className="space-y-2" data-testid="voice-model-section">
      <p className="text-sm font-medium">{t('voice.section.models')}</p>
      <VoiceModelCard
        kind="asr"
        name={asrMeta.name}
        description={asrMeta.description}
        totalBytes={modelStatus.asrTotalBytes}
        view={downloads.viewFor('asr')}
        onStart={() => downloads.start('asr')}
        onCancel={() => downloads.cancel('asr')}
      />
      {TTS_DISPLAY_ORDER.map((model) => {
        const info = modelStatus.ttsModels.find((m) => m.model === model);
        if (!info) return null;
        const meta = ttsMeta[model];
        return (
          <VoiceModelCard
            key={model}
            kind="tts"
            testIdKey={`tts-${model}`}
            name={meta.name}
            description={meta.description}
            totalBytes={info.totalBytes}
            view={downloads.viewFor('tts', model)}
            active={settings?.ttsModel === model}
            onStart={() => downloads.start('tts', model)}
            onCancel={() => downloads.cancel('tts', model)}
          />
        );
      })}
      <p className="text-xs text-muted-foreground">
        {t('voice.section.modelsHint')}
      </p>
    </div>
  );
}

/** 下载镜像与自定义模型目录（草稿态，点保存生效） */
function StorageSection() {
  const { t } = useI18n();
  const { settings, update } = useVoiceSettings();
  const toast = useToast();
  const [dataDir, setDataDir] = React.useState('');
  const [mirror, setMirror] = React.useState(HF_MIRROR);
  const [modelsDir, setModelsDir] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (settings) {
      setMirror(settings.modelMirrorBase ?? HF_MIRROR);
      setModelsDir(settings.modelsDir ?? '');
    }
  }, [settings]);
  React.useEffect(() => {
    void apiGet<{ dataDir: string }>('/api/system/info')
      .then((info) => setDataDir(info.dataDir))
      .catch(() => undefined);
  }, []);

  if (!settings) return null;

  const dirty =
    mirror !== (settings.modelMirrorBase ?? HF_MIRROR) ||
    modelsDir.trim() !== (settings.modelsDir ?? '');

  const save = async () => {
    setSaving(true);
    try {
      await update({
        modelMirrorBase: mirror,
        modelsDir: modelsDir.trim() || null,
      });
      toast.success(t('voice.storage.saved'));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('voice.storage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-storage-section">
      <p className="text-sm font-medium">{t('voice.storage.title')}</p>
      <div className="space-y-1.5">
        <Label htmlFor="voice-mirror">{t('voice.storage.mirrorLabel')}</Label>
        <Select id="voice-mirror" value={mirror} onChange={(e) => setMirror(e.target.value)}>
          <option value={HF_MIRROR}>{t('voice.storage.mirrorCn')}</option>
          <option value={HF_OFFICIAL}>{t('voice.storage.mirrorOfficial')}</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="voice-models-dir">{t('voice.storage.dirLabel')}</Label>
        <input
          id="voice-models-dir"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          placeholder={t('voice.storage.dirPlaceholder')}
          value={modelsDir}
          onChange={(e) => setModelsDir(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('voice.storage.dirHint', {
            path: dataDir ? `${dataDir}\\models\\voice` : t('voice.storage.dirDefault'),
          })}
        </p>
      </div>
      <div>
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? t('voice.storage.saving') : t('voice.storage.save')}
        </Button>
      </div>
    </div>
  );
}

/** 设置页「语音」面板：模型下载、引擎参数、试听、镜像目录、麦克风自检 */
export function VoicePreferencePanel() {
  const { t } = useI18n();
  const { settings, modelStatus, update } = useVoiceSettings();
  const toast = useToast();

  const patch = async (next: Parameters<typeof update>[0]) => {
    try {
      await update(next);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('voice.saveFailed'));
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="voice-panel">
      <div>
        <h3 className="font-medium">{t('voice.section.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('voice.section.description')}
        </p>
      </div>

      <ModelDownloadSection />

      {/* 真机基准取证（2026-10，高性能 x86 PC）：Windows「平衡」电源下
          CPU 持续功耗受限，Kokoro 合成 RTF 约 2.2（首句等待 5s+）；高性能电源下 RTF≈1.0 */}
      <p className="rounded-md border border-warning/30 bg-warning-background p-2 text-xs text-muted-foreground" data-testid="voice-power-hint">
        {t('voice.powerHint')}
      </p>

      {settings && (
        <VoiceEngineParams
          settings={settings}
          ttsReady={!!modelStatus?.ttsReady}
          asrReady={!!modelStatus?.asrReady}
          onPatch={patch}
        />
      )}

      {settings && (
        <VoiceInputSection
          settings={settings}
          asrReady={!!modelStatus?.asrReady}
          onPatch={patch}
        />
      )}

      <StorageSection />

      {settings && (
        <AvatarSection
          settings={settings}
          ttsReady={!!modelStatus?.ttsReady}
          onPatch={patch}
        />
      )}

      {settings && <ProactiveSection settings={settings} onPatch={patch} />}

      <div className="space-y-2 rounded-md border p-3" data-testid="voice-device-section">
        <p className="text-sm font-medium">{t('voice.section.deviceTest')}</p>
        <MicSelfTest />
      </div>
    </section>
  );
}
