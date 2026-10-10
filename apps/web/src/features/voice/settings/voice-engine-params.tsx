'use client';

import * as React from 'react';
import {
  getAvatarSpeakerId,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
  type VoiceTtsModel,
} from '@wbfm/shared/schemas';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { TtsPreview } from './tts-preview';

interface Props {
  settings: VoiceSettings;
  ttsReady: boolean;
  asrReady: boolean;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

const THREAD_OPTIONS = [1, 2, 4, 8];
const SPEED_OPTIONS = [0.8, 1, 1.2, 1.5];

/** 朗读引擎选择器：单选卡片，切换即时保存（服务端惰性重建引擎） */
function TtsModelSelector(props: {
  value: VoiceTtsModel;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}) {
  const { t } = useI18n();
  /** v1.1 朗读引擎选项（模型下载状态见「离线模型」区两张 TTS 卡） */
  const TTS_MODEL_OPTIONS: ReadonlyArray<{
    value: VoiceTtsModel;
    name: string;
    hint: string;
  }> = [
    {
      value: 'kokoro',
      name: t('voice.engine.kokoroName'),
      hint: t('voice.engine.kokoroHint'),
    },
    {
      value: 'melo',
      name: t('voice.engine.meloName'),
      hint: t('voice.engine.meloHint'),
    },
  ];

  return (
    <div className="space-y-1.5" role="radiogroup" aria-label={t('voice.engine.title')} data-testid="tts-model-selector">
      <Label>{t('voice.engine.title')}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {TTS_MODEL_OPTIONS.map((option) => {
          const selected = props.value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 ${
                selected ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : ''
              }`}
              data-testid={`tts-model-option-${option.value}`}
            >
              <input
                type="radio"
                name="tts-model"
                className="mt-0.5 h-4 w-4 shrink-0"
                value={option.value}
                checked={selected}
                onChange={() => void props.onPatch({ ttsModel: option.value })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.name}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** 通用开关行（复用：TTS/ASR 引擎参数、F8 主动说话设置） */
export function ToggleRow(props: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  // 本地态在离散事件内同步落 DOM（避免受控值经外部存储调度晚于点击校验造成抖动）；
  // 服务端值（含失败回滚）通过 effect 回同步
  const [localChecked, setLocalChecked] = React.useState(props.checked);
  React.useEffect(() => setLocalChecked(props.checked), [props.checked]);
  return (
    <label
      htmlFor={props.id}
      className="flex cursor-pointer items-start justify-between gap-3 disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-medium">{props.label}</span>
        <span className="block text-xs text-muted-foreground">{props.hint}</span>
      </span>
      <input
        id={props.id}
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        checked={localChecked}
        disabled={props.disabled}
        onChange={(e) => {
          setLocalChecked(e.target.checked);
          props.onChange(e.target.checked);
        }}
      />
    </label>
  );
}

/** TTS/ASR 引擎参数：开关、语速、线程数、试听（即时保存） */
export function VoiceEngineParams({ settings, ttsReady, asrReady, onPatch }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4" data-testid="voice-engine-params">
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t('voice.engine.ttsTitle')}</p>
        <ToggleRow
          id="tts-enabled"
          label={t('voice.engine.ttsToggleLabel')}
          hint={
            ttsReady
              ? t('voice.engine.ttsToggleHintReady')
              : t('voice.engine.ttsToggleHintNoModel', {
                  engine: settings.ttsModel === 'melo' ? 'MeloTTS' : 'Kokoro',
                })
          }
          checked={settings.ttsEnabled}
          disabled={!ttsReady}
          onChange={(next) => void onPatch({ ttsEnabled: next })}
        />
        <TtsModelSelector value={settings.ttsModel} onPatch={onPatch} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tts-speed">{t('voice.engine.speedLabel')}</Label>
            <Select
              id="tts-speed"
              value={settings.ttsSpeed}
              onChange={(e) => void onPatch({ ttsSpeed: Number(e.target.value) })}
            >
              {SPEED_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}x
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tts-threads">{t('voice.engine.threadsLabel')}</Label>
            <Select
              id="tts-threads"
              value={settings.ttsNumThreads}
              onChange={(e) => void onPatch({ ttsNumThreads: Number(e.target.value) })}
            >
              {THREAD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {t('voice.engine.threadsOption', { count: v })}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {settings.ttsModel === 'melo'
            ? t('voice.engine.meloNote')
            : t('voice.engine.kokoroNote')}
        </p>
        <TtsPreview
          ready={ttsReady}
          speakerId={
            settings.ttsModel === 'melo' ? 0 : getAvatarSpeakerId(settings.avatarModelId)
          }
        />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t('voice.engine.asrTitle')}</p>
        <ToggleRow
          id="asr-enabled"
          label={t('voice.engine.asrToggleLabel')}
          hint={asrReady ? t('voice.engine.asrToggleHintReady') : t('voice.engine.asrToggleHintNoModel')}
          checked={settings.asrEnabled}
          disabled={!asrReady}
          onChange={(next) => void onPatch({ asrEnabled: next })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="asr-threads">{t('voice.engine.threadsLabel')}</Label>
            <Select
              id="asr-threads"
              value={settings.asrNumThreads}
              onChange={(e) => void onPatch({ asrNumThreads: Number(e.target.value) })}
            >
              {THREAD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {t('voice.engine.threadsOption', { count: v })}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="input-mode">{t('voice.engine.inputModeLabel')}</Label>
            <Select id="input-mode" value={settings.inputMode} disabled>
              <option value="ptt">{t('voice.engine.inputModePttOption')}</option>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
