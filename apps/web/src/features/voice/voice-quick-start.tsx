'use client';

import * as React from 'react';
import { AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVoiceSettings } from './use-voice-settings';
import { VoiceDownloadGuide } from './voice-download-guide';
import { formatBytes } from './settings/voice-model-card';
import { DEFAULT_VOICE_PROFILE, profilePatch } from './voice-quick-config';
import type { HandsfreeVoice } from './use-handsfree-voice';

export interface VoiceQuickStartState {
  /** ASR 与当前 TTS 引擎均已就绪（就绪即一次点击可说话） */
  ready: boolean;
  /** 未就绪时需下载的总字节数（按当前选中 TTS 引擎计） */
  neededBytes: number;
  pending: boolean;
  enable: () => void;
}

/**
 * v2.4 M3（P0-3/T1）·「一键开启语音对话」的共同逻辑：设置页块状入口与对话页图标入口共用。
 *
 * 就绪态一次点击写入「开 ASR + 免手（D8）+ 开朗读 + 默认档位（M0 §4）」；
 * 传入对话页的 handsfree 时同时武装免手，实现「一次点击即进入可说话状态」（A2）。
 */
export function useVoiceQuickStart(handsfree?: HandsfreeVoice): VoiceQuickStartState | null {
  const { t } = useI18n();
  const toast = useToast();
  const { settings, modelStatus, update } = useVoiceSettings();
  const [pending, setPending] = React.useState(false);
  const handsfreeRef = React.useRef(handsfree);
  handsfreeRef.current = handsfree;

  const enable = React.useCallback(() => {
    if (!settings) return;
    setPending(true);
    void update({
      asrEnabled: true,
      inputMode: 'vad',
      ttsEnabled: true,
      ...profilePatch(DEFAULT_VOICE_PROFILE),
    })
      .then(() => {
        handsfreeRef.current?.arm();
        toast.success(t('voice.quickStart.enabled'));
      })
      .catch((error: unknown) => toast.error(errorText(error, t, { fallback: 'voice.saveFailed' })))
      .finally(() => setPending(false));
  }, [settings, update, t, toast]);

  if (!settings || !modelStatus) return null;

  const ttsBytes =
    modelStatus.ttsModels?.find((item) => item.model === settings.ttsModel)?.totalBytes ??
    modelStatus.ttsTotalBytes ??
    0;

  return {
    ready: modelStatus.asrReady && modelStatus.ttsReady,
    neededBytes: (modelStatus.asrTotalBytes ?? 0) + ttsBytes,
    pending,
    enable,
  };
}

/** 设置页语音面板顶部的块状入口（D7 入口①）：未就绪展开下载引导，就绪一次点击开启 */
export function VoiceQuickStart() {
  const { t } = useI18n();
  const state = useVoiceQuickStart();
  const [guideOpen, setGuideOpen] = React.useState(false);

  if (!state) return null;
  const label = state.ready
    ? t('voice.quickStart.actionReady')
    : t('voice.quickStart.actionDownload', { size: formatBytes(state.neededBytes) });

  return (
    <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3" data-testid="voice-quickstart-settings">
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={state.pending}
        data-testid="voice-quickstart-button"
        data-ready={state.ready || undefined}
        onClick={() => (state.ready ? state.enable() : setGuideOpen((prev) => !prev))}
      >
        <AudioLines className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      {/* T4：如实声明半双工边界，不假装全双工 */}
      <p className="text-[11px] text-muted-foreground" data-testid="voice-half-duplex-notice">
        {t('voice.quickStart.boundary')}
      </p>
      {!state.ready && guideOpen && <VoiceDownloadGuide />}
    </div>
  );
}
