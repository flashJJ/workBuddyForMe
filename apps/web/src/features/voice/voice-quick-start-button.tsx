'use client';

import * as React from 'react';
import { AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import { VoiceDownloadGuide } from './voice-download-guide';
import { formatBytes } from './settings/voice-model-card';
import { useVoiceQuickStart } from './voice-quick-start';
import type { HandsfreeVoice } from './use-handsfree-voice';

/**
 * v2.4 M3（P0-3/T1）· 对话页语音按钮旁的图标入口（D7 入口②）。
 * 就绪 → 一次点击写入设置并**当场武装免手**（A2）；未就绪 → 就地弹出下载引导（不跳页）；
 * 下载完成（就绪）后自动收起引导，图标按钮随即变为可用。
 */
export function VoiceQuickStartButton({ handsfree }: { handsfree: HandsfreeVoice }) {
  const { t } = useI18n();
  const state = useVoiceQuickStart(handsfree);
  const [open, setOpen] = React.useState(false);
  const ready = state?.ready ?? false;

  React.useEffect(() => {
    if (ready) setOpen(false);
  }, [ready]);

  if (!state) return null;
  const label = state.ready
    ? t('voice.quickStart.actionReady')
    : t('voice.quickStart.actionDownload', { size: formatBytes(state.neededBytes) });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-pressed={state.ready}
        aria-label={label}
        title={label}
        disabled={state.pending}
        data-testid="voice-quickstart-button"
        data-ready={state.ready || undefined}
        onClick={() => (state.ready ? state.enable() : setOpen(true))}
      >
        <AudioLines className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('voice.quickStart.actionReady')}</DialogTitle>
            <DialogDescription>{t('voice.quickStart.boundary')}</DialogDescription>
          </DialogHeader>
          <VoiceDownloadGuide />
        </DialogContent>
      </Dialog>
    </>
  );
}
