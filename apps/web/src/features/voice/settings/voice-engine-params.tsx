'use client';

import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  getAvatarSpeakerId,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
  type VoiceTtsModel,
} from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

interface Props {
  settings: VoiceSettings;
  ttsReady: boolean;
  asrReady: boolean;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

const THREAD_OPTIONS = [1, 2, 4, 8];
const SPEED_OPTIONS = [0.8, 1, 1.2, 1.5];
const PREVIEW_TEXT = '你好，我是你的本地语音助手，所有语音都在本机完成。';

/** v1.1 朗读引擎选项（模型下载状态见「离线模型」区两张 TTS 卡） */
const TTS_MODEL_OPTIONS: ReadonlyArray<{
  value: VoiceTtsModel;
  name: string;
  hint: string;
}> = [
  {
    value: 'kokoro',
    name: 'Kokoro 多角色声线',
    hint: '103 个中英音色，声线按所选 Live2D 角色自动绑定',
  },
  {
    value: 'melo',
    name: 'MeloTTS 低延迟单声',
    hint: '单一中文女声，CPU 合成更快，免手聆听首句等待更短',
  },
];

/** 朗读引擎选择器：单选卡片，切换即时保存（服务端惰性重建引擎） */
function TtsModelSelector(props: {
  value: VoiceTtsModel;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="朗读引擎" data-testid="tts-model-selector">
      <Label>朗读引擎</Label>
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

/** TTS 试听：拉取 WAV 后用 HTMLAudio 播放（fetch 以附带 Electron 托管 token） */
function TtsPreview(props: { ready: boolean; speakerId: number }) {
  const toast = useToast();
  const [text, setText] = React.useState(PREVIEW_TEXT);
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const play = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      const res = await fetch(
        API.voiceTts,
        withManagedHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 200) || PREVIEW_TEXT, speakerId: props.speakerId }),
        }),
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? `合成失败（HTTP ${res.status}）`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
        toast.error('试听播放失败');
      };
      await audio.play();
    } catch (err) {
      setPlaying(false);
      toast.error(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="tts-preview-text">试听</Label>
      <div className="flex gap-2">
        <input
          id="tts-preview-text"
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          disabled={!props.ready}
          data-testid="tts-preview-text"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={!props.ready || playing}
          onClick={() => void play()}
          data-testid="tts-preview-button"
        >
          {playing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
          播放
        </Button>
      </div>
    </div>
  );
}

/** TTS/ASR 引擎参数：开关、语速、线程数、试听（即时保存） */
export function VoiceEngineParams({ settings, ttsReady, asrReady, onPatch }: Props) {
  return (
    <div className="space-y-4" data-testid="voice-engine-params">
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">语音朗读（TTS）</p>
        <ToggleRow
          id="tts-enabled"
          label="回复自动朗读"
          hint={
            ttsReady
              ? '对话页也可用朗读按钮临时开关'
              : `请先下载当前引擎（${settings.ttsModel === 'melo' ? 'MeloTTS' : 'Kokoro'}）的模型`
          }
          checked={settings.ttsEnabled}
          disabled={!ttsReady}
          onChange={(next) => void onPatch({ ttsEnabled: next })}
        />
        <TtsModelSelector value={settings.ttsModel} onPatch={onPatch} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tts-speed">语速</Label>
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
            <Label htmlFor="tts-threads">推理线程</Label>
            <Select
              id="tts-threads"
              value={settings.ttsNumThreads}
              onChange={(e) => void onPatch({ ttsNumThreads: Number(e.target.value) })}
            >
              {THREAD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v} 线程
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {settings.ttsModel === 'melo'
            ? 'MeloTTS 为单说话人模型：所有角色共用同一中文女声，切换角色不改变声线'
            : 'Kokoro 多说话人：声线按「Live2D 形象」选中的角色自动绑定（103 个中英音色，可在形象区逐角色试听）'}
        </p>
        <TtsPreview
          ready={ttsReady}
          speakerId={
            settings.ttsModel === 'melo' ? 0 : getAvatarSpeakerId(settings.avatarModelId)
          }
        />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">语音输入（ASR）</p>
        <ToggleRow
          id="asr-enabled"
          label="启用语音输入"
          hint={asrReady ? '开启后对话页输入框旁显示麦克风按钮（按住说话）' : '请先下载 ASR 模型'}
          checked={settings.asrEnabled}
          disabled={!asrReady}
          onChange={(next) => void onPatch({ asrEnabled: next })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="asr-threads">推理线程</Label>
            <Select
              id="asr-threads"
              value={settings.asrNumThreads}
              onChange={(e) => void onPatch({ asrNumThreads: Number(e.target.value) })}
            >
              {THREAD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v} 线程
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="input-mode">输入方式</Label>
            <Select id="input-mode" value={settings.inputMode} disabled>
              <option value="ptt">按住说话（PTT）· 自动断句后续版本提供</option>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
