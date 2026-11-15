'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PetScriptPlaybackSummary, PetScriptStatusView } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { TheaterEpisode, TheaterLine } from './theater-script';

interface Props {
  episode: TheaterEpisode;
  line: TheaterLine;
  index: number;
  total: number;
  /** 截图时隐藏按钮，卡面保持可见 */
  uiHidden: boolean;
  onSave: () => void;
  onClose: () => void;
}

function dateLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * M4 分享卡：本机叠一张剧情卡再走舞台截图，不新开导出通道。
 * 今日数据失败时显示 `--`，不阻断卡面。
 */
export function StageShareCard(props: Props) {
  const { t, locale } = useI18n();
  const playback = useQuery({
    queryKey: ['stage-share-card', 'playback'],
    queryFn: () => apiGet<PetScriptPlaybackSummary>('/api/pet/script/playback'),
    staleTime: 60_000,
    retry: false,
  });
  const status = useQuery({
    queryKey: ['stage-share-card', 'status'],
    queryFn: () => apiGet<PetScriptStatusView>('/api/pet/script'),
    staleTime: 60_000,
    retry: false,
  });

  const speaker = props.episode.cast.find((member) => member.slot === props.line.slot)?.displayName ?? '';
  const plays = playback.data ? `${playback.data.playsToday}/${playback.data.perDay}` : '--';
  const generated = status.data ? String(status.data.scenes.length) : '--';

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6"
      data-testid="stage-share-card"
    >
      <div className="flex min-h-[560px] w-[420px] flex-col justify-between rounded-2xl border border-amber-200/25 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 p-6 text-white shadow-2xl">
        <header className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
            {t('stage.shareCard.title')}
          </p>
          <h2 className="text-lg font-semibold">{props.episode.title}</h2>
          <p className="text-[11px] text-white/50">
            {dateLabel(locale)} · {props.index + 1}/{props.total}
          </p>
          <p className="text-[11px] text-white/40">
            {props.episode.cast.map((member) => member.displayName).join(' · ')}
          </p>
        </header>

        <blockquote className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] text-amber-100/80">{speaker}</p>
          <p className="text-sm leading-6 text-white/90">{props.line.text}</p>
        </blockquote>

        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <dt className="text-[10px] text-white/45">{t('stage.shareCard.playing')}</dt>
            <dd className="text-sm font-semibold">{plays}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <dt className="text-[10px] text-white/45">{t('stage.shareCard.generated')}</dt>
            <dd className="text-sm font-semibold">{generated}</dd>
          </div>
        </dl>

        <footer className="space-y-3">
          <p className="text-[10px] text-white/40">{t('stage.shareCard.footer')}</p>
          {!props.uiHidden && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/80 hover:bg-white/10"
                data-testid="stage-share-card-close"
                onClick={props.onClose}
              >
                {t('stage.shareCard.close')}
              </button>
              <button
                type="button"
                className="rounded-md bg-amber-300/90 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-amber-200"
                data-testid="stage-share-card-save"
                onClick={props.onSave}
              >
                {t('stage.shareCard.save')}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

/** 剧场覆盖层：轮播角标 + 分享卡（卡面不受 uiHidden 影响） */
export function StageTheaterOverlay(props: {
  episode: TheaterEpisode;
  index: number;
  total: number;
  /** 当前幕名（可选；显示在轮播角标前） */
  actTitle?: string;
  line: TheaterLine;
  uiHidden: boolean;
  shareOpen: boolean;
  /** 三席模型就绪前保持幕布关闭 */
  ready?: boolean;
  readyCount?: number;
  readyTotal?: number;
  bgmMuted?: boolean;
  audioBlocked?: boolean;
  onToggleBgm?: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const readyTotal = props.readyTotal ?? 0;
  const pct = readyTotal > 0 ? Math.round(((props.readyCount ?? 0) / readyTotal) * 100) : 0;
  return (
    <>
      {props.ready === false && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#12060c]"
          data-testid="theater-loading-curtain"
        >
          <div className="w-64 text-center text-white/80">
            <p className="text-sm font-medium">{t('stage.theater.loading')}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-amber-300/80 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-white/45">
              {t('stage.theater.loadingCount', { done: props.readyCount ?? 0, total: readyTotal })}
            </p>
            <p className="mt-1 text-[10px] text-white/30">{t('stage.theater.loadingHint')}</p>
          </div>
        </div>
      )}
      <div
        className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded bg-black/45 px-2 py-0.5 text-[11px] text-white/75"
        data-testid="stage-theater-badge"
      >
        {props.actTitle ? `${props.actTitle} · ` : ''}
        {t('stage.theater.lineHint', { index: props.index + 1, total: props.total })}
      </div>
      {props.onToggleBgm && !props.uiHidden && (
        <button
          type="button"
          className="absolute right-3 top-3 z-40 rounded bg-black/45 px-2 py-0.5 text-[11px] text-white/75 hover:bg-black/65"
          data-testid="stage-theater-bgm"
          data-muted={props.bgmMuted ? 'true' : 'false'}
          onClick={props.onToggleBgm}
        >
          {props.audioBlocked && !props.bgmMuted
            ? t('stage.theater.audioBlocked')
            : props.bgmMuted
              ? t('stage.theater.bgmOff')
              : t('stage.theater.bgmOn')}
        </button>
      )}
      {props.shareOpen && (
        <StageShareCard
          episode={props.episode}
          line={props.line}
          index={props.index}
          total={props.total}
          uiHidden={props.uiHidden}
          onSave={props.onSave}
          onClose={props.onClose}
        />
      )}
    </>
  );
}
