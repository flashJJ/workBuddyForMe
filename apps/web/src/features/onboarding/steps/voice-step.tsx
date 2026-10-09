'use client';

import * as React from 'react';
import type { VoiceTtsModel } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVoiceSettings } from '@/features/voice/use-voice-settings';
import { useVoiceModelDownloads } from '@/features/voice/settings/use-voice-model-downloads';

/** 语音模型下载状态条（复用轮询状态，0~1 进度，未知总量时显示不确定态） */
function ProgressRow({
  label,
  ratio,
  active,
  ready,
}: {
  label: string;
  ratio: number;
  active: boolean;
  ready: boolean;
}) {
  const percent = Math.round(ratio * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {ready ? '✓' : active ? `${percent}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
        <div
          className="h-full bg-primary transition-all"
          style={{ width: ready ? '100%' : `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 向导第 3 步：语音模型可选下载（ASR ~228MB + TTS ~190MB，后台续传，不阻断）。
 */
export function VoiceStep() {
  const { t } = useI18n();
  const { modelStatus } = useVoiceSettings();
  const downloads = useVoiceModelDownloads();
  const ttsModel: VoiceTtsModel = modelStatus?.activeTtsModel ?? 'melo';
  const asr = downloads.viewFor('asr');
  const tts = downloads.viewFor('tts', ttsModel);
  const [started, setStarted] = React.useState(false);

  const startBoth = () => {
    downloads.start('asr');
    downloads.start('tts', ttsModel);
    setStarted(true);
  };

  return (
    <div className="space-y-4" data-testid="onboarding-voice">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('onboarding.voice.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.voice.lead')}</p>
        <p className="text-xs text-muted-foreground">{t('onboarding.voice.sizeHint')}</p>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <ProgressRow
          label={t('onboarding.voice.downloadAsr')}
          ratio={asr.ratio}
          active={asr.active}
          ready={asr.ready}
        />
        <ProgressRow
          label={t('onboarding.voice.downloadTts')}
          ratio={tts.ratio}
          active={tts.active}
          ready={tts.ready}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={startBoth}
          disabled={downloads.starting || (asr.ready && tts.ready)}
          data-testid="ob-voice-both"
        >
          {t('onboarding.voice.downloadBoth')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            downloads.start('asr');
            setStarted(true);
          }}
          disabled={downloads.starting || asr.ready}
        >
          {t('onboarding.voice.downloadAsr')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            downloads.start('tts', ttsModel);
            setStarted(true);
          }}
          disabled={downloads.starting || tts.ready}
        >
          {t('onboarding.voice.downloadTts')}
        </Button>
      </div>
      {started && <p className="text-xs text-muted-foreground">{t('onboarding.voice.backgroundHint')}</p>}
    </div>
  );
}
