'use client';

import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

/** 角色声线试听：按绑定 sid 合成 WAV 并播放 */
export function AvatarVoicePreview(props: { sid: number; ready: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [playing, setPlaying] = React.useState(false);

  const play = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      const res = await fetch(
        API.voiceTts,
        withManagedHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: t('voice.avatar.previewText'), speakerId: props.sid }),
        }),
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? t('voice.preview.synthFailed', { status: res.status }));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
        toast.error(t('voice.preview.playbackFailed'));
      };
      await audio.play();
    } catch (err) {
      setPlaying(false);
      toast.error(err instanceof ApiClientError ? err.message : (err as Error).message);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0"
      disabled={!props.ready || playing}
      onClick={() => void play()}
      data-testid="avatar-voice-preview"
    >
      {playing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
      {t('voice.avatar.previewButton')}
    </Button>
  );
}
