'use client';

import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared';
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

function ToggleRow(props: {
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
function TtsPreview(props: { ready: boolean }) {
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
          body: JSON.stringify({ text: text.slice(0, 200) || PREVIEW_TEXT }),
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
          hint={ttsReady ? '对话页也可用朗读按钮临时开关' : '请先下载 TTS 模型'}
          checked={settings.ttsEnabled}
          disabled={!ttsReady}
          onChange={(next) => void onPatch({ ttsEnabled: next })}
        />
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
        <p className="text-xs text-muted-foreground">发音人：内置中英混合女声（唯一）</p>
        <TtsPreview ready={ttsReady} />
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
