'use client';

import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  AVATAR_TTS_VOICES,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import { AVATAR_MODEL_LIST, getAvatarModel } from '@/features/avatar/avatar-models';
import { getPetBridge } from '@/features/pet/pet-bridge';
import { usePetOpenState } from '@/features/pet/use-pet-voice-relay';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

interface Props {
  settings: VoiceSettings;
  ttsReady: boolean;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

/** 角色声线试听：按绑定 sid 合成 WAV 并播放 */
function AvatarVoicePreview(props: { sid: number; ready: boolean }) {
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

/**
 * Live2D 形象：对话页右侧虚拟角色开关 + 内置模型选择（M3.5 起 5 套官方样本）。
 * M4 伴身：桌面端额外提供「桌宠模式」开关（透明置顶小窗，仅 Electron preload 有桥时出现）。
 * M4.5：每个角色绑定固定 Kokoro 声线，可就地试听。
 */
export function AvatarSection({ settings, ttsReady, onPatch }: Props) {
  const { t } = useI18n();
  // 本地态在离散事件内同步落 DOM（避免外部存储驱动的受控 Select 二次操作回退），
  // 服务端值通过 effect 回同步
  const [enabled, setEnabled] = React.useState(settings.avatarEnabled);
  const [modelId, setModelId] = React.useState(settings.avatarModelId);
  React.useEffect(() => setEnabled(settings.avatarEnabled), [settings.avatarEnabled]);
  React.useEffect(() => setModelId(settings.avatarModelId), [settings.avatarModelId]);

  const model = getAvatarModel(modelId);
  const voice = AVATAR_TTS_VOICES[model.id as keyof typeof AVATAR_TTS_VOICES] ?? AVATAR_TTS_VOICES.haru;
  const petBridge = React.useMemo(() => getPetBridge(), []);
  const petOpen = usePetOpenState();

  // 桌宠开关：本地态 + PUT 持久化 + 主进程开窗/关窗；
  // 桌宠自身右键「隐藏」会广播 open=false（onOpenChange），同步回本地态并落库
  React.useEffect(() => {
    if (!petBridge) return;
    const off = petBridge.onOpenChange((open) => {
      if (!open) void onPatch({ petEnabled: false });
    });
    return off;
  }, [petBridge, onPatch]);

  const togglePet = React.useCallback(
    (next: boolean) => {
      if (!petBridge) return;
      if (next) {
        void onPatch({ petEnabled: true });
        void petBridge.open(model.id);
      } else {
        void onPatch({ petEnabled: false });
        void petBridge.close();
      }
    },
    [petBridge, onPatch, model.id],
  );

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-avatar-section">
      <p className="text-sm font-medium">{t('voice.avatar.title')}</p>
      <label
        className="flex cursor-pointer items-start justify-between gap-3"
        data-testid="avatar-enabled-row"
      >
        <span>
          <span className="block text-sm font-medium">{t('voice.avatar.chatToggleLabel')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('voice.avatar.chatToggleHint')}
          </span>
        </span>
        <input
          id="avatar-enabled"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          data-testid="avatar-enabled"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            void onPatch({ avatarEnabled: e.target.checked });
          }}
        />
      </label>

      {enabled && (
        <div className="space-y-1.5" data-testid="avatar-model-row">
          <Label htmlFor="avatar-model">{t('voice.avatar.modelLabel')}</Label>
          <Select
            id="avatar-model"
            data-testid="avatar-model"
            value={model.id}
            onChange={(e) => {
              const next = e.target.value;
              setModelId(next);
              void onPatch({ avatarModelId: next });
              // 桌宠正开着：原位切换桌宠模型（主进程 open 对不同模型做静默换窗），
              // 不必先关再勾选；桌宠未开时 open 不调用即无副作用
              if (petBridge && petOpen) void petBridge.open(next);
            }}
          >
            {AVATAR_MODEL_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.label)}
              </option>
            ))}
          </Select>
          <div
            className="flex items-center justify-between gap-2"
            data-testid="avatar-voice-row"
          >
            {settings.ttsModel === 'melo' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('voice.avatar.meloNote')}
                </p>
                <AvatarVoicePreview sid={0} ready={ttsReady} />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('voice.avatar.voiceBinding', {
                    voice: voice.voice,
                    gender: voice.gender === 'female' ? t('voice.avatar.femaleVoice') : t('voice.avatar.maleVoice'),
                    sid: voice.sid,
                  })}
                </p>
                <AvatarVoicePreview sid={voice.sid} ready={ttsReady} />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('voice.avatar.modelsNote')}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('voice.avatar.resourceNote')}
      </p>

      {petBridge && (
        <div className="border-t pt-3">
          <label
            className="flex cursor-pointer items-start justify-between gap-3"
            data-testid="pet-enabled-row"
          >
            <span>
              <span className="block text-sm font-medium">{t('voice.avatar.petModeLabel')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('voice.avatar.petModeHint')}
              </span>
            </span>
            <input
              id="pet-enabled"
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              data-testid="pet-enabled"
              checked={petOpen}
              onChange={(e) => togglePet(e.target.checked)}
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('voice.avatar.petModeNote')}
          </p>
        </div>
      )}
    </div>
  );
}
