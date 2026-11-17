'use client';

import * as React from 'react';
import { Copy, FileAudio } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import {
  MUSIC_ATMOSPHERES,
  musicAtmospherePrompt,
  musicAtmosphereTitle,
  musicAtmosphereUseCase,
} from './music-atmospheres';

/** 氛围清单：给豆包等生成工具用的曲目规格与提示词 */
export function MusicAtmospherePanel() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('music.atmospheres.copied'));
    } catch {
      toast.error(t('music.atmospheres.copyFailed'));
    }
  };

  const copyAll = () => {
    const lines = [
      t('music.atmospheres.docTitle'),
      '',
      ...MUSIC_ATMOSPHERES.map((item, index) =>
        [
          `${index + 1}. ${musicAtmosphereTitle(item, locale)} · ${item.filename}`,
          `   ${item.bpm} BPM · ${item.duration} · ${musicAtmosphereUseCase(item, locale)}`,
          `   ${musicAtmospherePrompt(item, locale)}`,
        ].join('\n'),
      ),
    ];
    void copy(lines.join('\n'));
  };

  return (
    <section className="space-y-2 rounded-lg border bg-ui-card p-3" data-testid="music-atmosphere-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-medium">
            <FileAudio className="h-3.5 w-3.5 text-primary" />
            {t('music.atmospheres.title')}
          </h4>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('music.atmospheres.hint')}</p>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="shrink-0 rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
          data-testid="music-copy-all"
        >
          {t('music.atmospheres.copyAll')}
        </button>
      </div>

      <div className="space-y-1.5">
        {MUSIC_ATMOSPHERES.map((item) => (
          <details
            key={item.id}
            className="rounded-md border px-2.5 py-2"
            data-testid={`music-atmosphere-${item.id}`}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {musicAtmosphereTitle(item, locale)}
                <span className="ml-1.5 text-[11px] text-muted-foreground">{item.filename}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {item.bpm} BPM · {item.duration}
              </span>
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {t('music.atmospheres.useCase')}：{musicAtmosphereUseCase(item, locale)}
              </p>
              <p className="rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                {musicAtmospherePrompt(item, locale)}
              </p>
              <button
                type="button"
                onClick={() => void copy(musicAtmospherePrompt(item, locale))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
              >
                <Copy className="h-3 w-3" />
                {t('music.atmospheres.copyPrompt')}
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
