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
import { ApiClientError } from '@/lib/api/client';
import { apiGet } from '@/lib/api/client';

const HF_MIRROR = 'https://hf-mirror.com';
const HF_OFFICIAL = 'https://huggingface.co';

const ASR_MODEL_META = {
  name: '离线语音识别 SenseVoice',
  description: '中文/英文/日文/粤语转文字，int8 量化',
} as const;

/** v1.1 两套 TTS 引擎的展示文案（顺序即设置页展示顺序：默认引擎在前） */
const TTS_MODEL_META: Record<
  'melo' | 'kokoro',
  { name: string; description: string }
> = {
  kokoro: {
    name: '离线语音合成 Kokoro',
    description: '中英 103 个音色，按 Live2D 角色绑定声线，体积较大',
  },
  melo: {
    name: '离线语音合成 MeloTTS',
    description: 'VITS 中英单女声，合成更快、免手聆听首句等待更短',
  },
};
const TTS_DISPLAY_ORDER = ['kokoro', 'melo'] as const;

/** 模型下载管理（ASR 一张 + TTS 每引擎一张） */
function ModelDownloadSection() {
  const { modelStatus, settings } = useVoiceSettings();
  const downloads = useVoiceModelDownloads();
  if (!modelStatus) return null;
  return (
    <div className="space-y-2" data-testid="voice-model-section">
      <p className="text-sm font-medium">离线模型</p>
      <VoiceModelCard
        kind="asr"
        name={ASR_MODEL_META.name}
        description={ASR_MODEL_META.description}
        totalBytes={modelStatus.asrTotalBytes}
        view={downloads.viewFor('asr')}
        onStart={() => downloads.start('asr')}
        onCancel={() => downloads.cancel('asr')}
      />
      {TTS_DISPLAY_ORDER.map((model) => {
        const info = modelStatus.ttsModels.find((m) => m.model === model);
        if (!info) return null;
        const meta = TTS_MODEL_META[model];
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
        模型不进安装包，首次使用时下载到本机；下载完成后语音功能完全离线可用。两套朗读引擎可只下载当前使用的一套。
      </p>
    </div>
  );
}

/** 下载镜像与自定义模型目录（草稿态，点保存生效） */
function StorageSection() {
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
      toast.success('语音存储设置已保存（新下载按此配置进行）');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-storage-section">
      <p className="text-sm font-medium">镜像与存储</p>
      <div className="space-y-1.5">
        <Label htmlFor="voice-mirror">模型下载源</Label>
        <Select id="voice-mirror" value={mirror} onChange={(e) => setMirror(e.target.value)}>
          <option value={HF_MIRROR}>hf-mirror.com 国内镜像（推荐）</option>
          <option value={HF_OFFICIAL}>huggingface.co 官方直连</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="voice-models-dir">自定义模型目录</Label>
        <input
          id="voice-models-dir"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          placeholder="留空使用默认目录"
          value={modelsDir}
          onChange={(e) => setModelsDir(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          默认：{dataDir ? `${dataDir}\\models\\voice` : '数据目录下 models/voice'}
          ；更换目录后需重新下载模型。
        </p>
      </div>
      <div>
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存存储设置'}
        </Button>
      </div>
    </div>
  );
}

/** 设置页「语音」面板：模型下载、引擎参数、试听、镜像目录、麦克风自检 */
export function VoicePreferencePanel() {
  const { settings, modelStatus, update } = useVoiceSettings();
  const toast = useToast();

  const patch = async (next: Parameters<typeof update>[0]) => {
    try {
      await update(next);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '设置保存失败');
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="voice-panel">
      <div>
        <h3 className="font-medium">语音</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          离线语音识别与朗读：模型、音频与识别内容均不离开本机。
        </p>
      </div>

      <ModelDownloadSection />

      {/* 真机基准取证（Ultra 9 275HX + RTX 5070Ti，2026-10）：Windows「平衡」电源下
          CPU 持续功耗受限，Kokoro 合成 RTF 约 2.2（首句等待 5s+）；高性能电源下 RTF≈1.0 */}
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-muted-foreground" data-testid="voice-power-hint">
        免手聆听首句等待偏长？离线 TTS 跑在 CPU 上：请插电并在 Windows「电源计划」选择「最佳性能/高性能」
        （实测可缩短一半以上合成等待）；笔记本平衡模式会限制持续算力。GPU 已自动用于对话模型。
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
        <p className="text-sm font-medium">设备自检</p>
        <MicSelfTest />
      </div>
    </section>
  );
}
