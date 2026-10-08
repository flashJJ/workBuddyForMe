'use client';

import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

const PREVIEW_TEXT = '你好，我是你的本地语音助手，所有语音都在本机完成。';

/** TTS 试听：拉取 WAV 后用 HTMLAudio 播放（fetch 以附带 Electron 托管 token） */
export function TtsPreview(props: { ready: boolean; speakerId: number }) {
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
