'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/use-i18n';
import { translateSystemText } from '@/lib/i18n/system-text-runtime';
import { isVrmAvatarId } from '@wbfm/shared/schemas';
import { StageBackgroundLayer } from './stage-background';
import { StageActor } from './stage-actor';
import { StageDialogBox } from './stage-dialog-box';
import { StageToolbar } from './stage-toolbar';
import { StageLive2dLayer, type StageLive2dActor } from './live2d';
import { computeActorLayout, meetingPosition, stageFacingYaw } from './stage-layout';
import { useStageController, type StageMode } from './use-stage-controller';
import { useStageRun } from './use-stage-run';
import { useMeetingStage } from './use-meeting-stage';
import { useStageSpeech } from './voice/use-stage-speech';
import { getStageBridge, toggleStageFullscreen } from './stage-bridge';
import { findTheaterEpisode, localizeTheaterEpisode, theaterActAt, theaterBackdropAt } from './theater/theater-script';
import { TheaterBackdrop } from './theater/theater-backdrop';
import { useStageTheater } from './theater/use-stage-theater';
import { StageTheaterOverlay } from './theater/stage-share-card';
import { useStageTarget } from './theater/stage-target';

/** 舞台口型：真实语音电平优先，合成失败/未启用时回到控制器正弦口型 */
const stageLevel = (base: () => number, active: boolean, voiceLevel: () => number) => () => Math.max(base(), active ? voiceLevel() : 0);

/**
 * 舞台根：
 * - mock 模式（M1）：本地演示 cast 可演；
 * - run 模式（M2，?run=id）：只读订阅真实协作 run；
 * - meeting 模式（M3，?meeting=id）：只读观看多助手会议（2–4 席）。
 * 后两者零执行控件，关窗不杀后台；快捷键 H/F11/Esc/Ctrl+滚轮。
 */
export function StageRoot() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { runId, meetingId, theater: theaterMode, episodeId } = useStageTarget();
  const mode: StageMode = theaterMode ? 'theater' : meetingId ? 'meeting' : runId ? 'run' : 'mock';
  const c = useStageController(mode);
  const episode = React.useMemo(() => localizeTheaterEpisode(findTheaterEpisode(episodeId), locale), [episodeId, locale]);
  const [shareOpen, setShareOpen] = React.useState(false);
  const { say, stop, voice } = useStageSpeech({
    mode,
    cast: c.cast,
    sayLine: c.sayLine,
    clearSpeech: c.clearSpeech,
  });
  const theater = useStageTheater({
    enabled: mode === 'theater',
    episode,
    applyDirection: c.applyDirection,
    voice,
  });
  useStageRun(runId, c);
  const meeting = useMeetingStage(meetingId, c);
  const rootRef = React.useRef<HTMLDivElement>(null);
  // 鼠标移动唤醒控制栏（pointermove 足够频繁，无需节流，poke 内部幂等重置计时）
  React.useEffect(() => {
    window.addEventListener('pointermove', c.poke);
    return () => window.removeEventListener('pointermove', c.poke);
  }, [c.poke]);
  // 键盘快捷键
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'h' || event.key === 'H') {
        // 输入框聚焦时不抢键
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        c.toggleUi();
      } else if (event.key === 'F11') {
        event.preventDefault();
        void toggleStageFullscreen();
      } else if (event.key === 'Escape') {
        const result = c.handleEsc();
        if (result === 'exited') exitStage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.handleEsc, c.toggleUi]);

  const exitStage = React.useCallback(() => {
    const bridge = getStageBridge();
    if (bridge) void bridge.close();
    else router.push('/chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onRootWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      c.zoomSceneBy(event.deltaY > 0 ? -0.05 : 0.05);
    }
  };

  // mock：散焦即收台词；run/meeting：最近一句台词挂住（跨等待期不空白）
  const activeLine =
    mode === 'mock'
      ? c.focus && c.speech[c.focus]
        ? { slot: c.focus, text: c.speech[c.focus]! }
        : null
      : c.lastLine;
  const dialogSpeaker = activeLine
    ? c.cast.find((m) => m.slot === activeLine.slot)?.displayName ?? ''
    : '';
  const dialogText = activeLine ? (translateSystemText(activeLine.text) || activeLine.text) : '';
  const showChrome = !c.uiHidden && c.controlsVisible;

  // 每个槽位的布局只算一次：共享 Live2D 层与 DOM 命中盒必须使用同一组坐标
  const actorViews = c.cast.map((member, castIndex) => {
    const slot = member.slot;
    const positionOverride = mode === 'meeting' ? meetingPosition(castIndex, Math.max(c.cast.length, 2)) : null;
    return {
      member,
      slot,
      live: c.powerMode === 'live' || slot === c.focus,
      layout: computeActorLayout(slot, c.payload, c.focus, positionOverride),
    };
  });
  const live2dActors: StageLive2dActor[] = actorViews
    .filter((view) => !isVrmAvatarId(view.member.avatarModelId))
    .map((view) => ({
      slot: view.slot,
      modelId: view.member.avatarModelId,
      layout: view.layout,
      expression: c.expressions[view.slot]!,
      speaking: view.slot === c.speakingSlot && Boolean(c.speech[view.slot]),
      // 有真实语音时用播放电平驱动口型，合成失败/未启用时退回控制器的正弦口型
      getLevel: stageLevel(
        c.levelReader(view.slot),
        voice.speaking && view.slot === c.speakingSlot,
        voice.getLevel,
      ),
    }));

  return (
    <div
      ref={rootRef}
      className="relative h-screen w-screen overflow-hidden bg-black"
      data-testid="stage-root"
      data-mode={mode}
      data-power={c.powerMode}
      data-run-status={c.runStatus ?? undefined}
      onWheel={onRootWheel}
    >
      <StageBackgroundLayer background={c.payload.background} />
      {mode === 'theater' && <TheaterBackdrop variant={theaterBackdropAt(episode, theater.index)} focus={c.focus} slots={c.payload.slots} />}

      {/* 2D 暖光层（不做三维光照） */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        aria-hidden="true"
        data-testid="stage-warm-filter"
        style={{
          backgroundColor: c.payload.warmFilter.color,
          opacity: c.payload.warmFilter.opacity,
          mixBlendMode: 'soft-light',
        }}
      />

      {/* run 模式接入状态角标（只读信息，非控制件；截图前随 UI 一并隐藏） */}
      {mode === 'run' && c.runStatus && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-40 rounded bg-black/45 px-2 py-0.5 text-[11px] text-white/80"
          data-testid="stage-run-status"
          data-state={c.runStatus}
        >
          {c.runStatus === 'connecting' ? t('stage.run.reconnecting') : c.runStatus}
        </div>
      )}
      {/* meeting 模式状态角标：状态 + 接龙轮次 */}
      {mode === 'meeting' && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-40 rounded bg-black/45 px-2 py-0.5 text-[11px] text-white/80"
          data-testid="stage-meeting-status"
          data-state={meeting.status}
        >
          {meeting.status === 'connecting'
            ? t('stage.run.reconnecting')
            : meeting.status === 'active'
              ? t('meeting.room.statusActive')
              : meeting.status === 'finished'
                ? t('meeting.room.statusFinished')
                : t('meeting.room.statusAborted')}
          {meeting.mode === 'auto' && meeting.status === 'active'
            ? ` · ${t('meeting.room.autoRound', { used: meeting.autoRounds, max: 8 })}`
            : ''}
        </div>
      )}

      {/* 角色（cast 驱动：mock/run 三槽，meeting 2–4 席均布） */}
      <div className="absolute inset-0 z-10" data-testid="stage-cast">
        <StageLive2dLayer actors={live2dActors} powerMode={c.powerMode} focus={c.focus} motionCue={mode === 'theater' ? theater.cue : null} motionSlot={mode === 'theater' ? theater.current.slot : null} motionKey={mode === 'theater' ? theater.index : undefined} />
        {actorViews.map(({ member, slot, live, layout }) => (
          <StageActor
            key={slot}
            slot={slot}
            member={{ ...member, expression: c.expressions[slot]! }}
            layout={layout}
            live={live}
            expression={c.expressions[slot]!} expressionIntensity={c.expressionIntensities[slot]!}
            actionLabelKey={
              mode === 'mock' ? member.actionLabelKey : `stage.run.action.${c.motions[slot]}`
            }
            speaking={slot === c.speakingSlot && Boolean(c.speech[slot])}
            showNameplate={c.payload.showNameplates}
            getLevel={stageLevel(c.levelReader(slot), voice.speaking && slot === c.speakingSlot, voice.getLevel)}
            motionCue={mode === 'theater' && slot === theater.current.slot ? theater.cue : null} motionCueKey={mode === 'theater' ? theater.index : undefined}
            stageFacing={stageFacingYaw(layout.leftPct, actorViews.filter((view) => view.slot !== slot).map((view) => view.layout.leftPct))}
            onActorReady={theater.markActorReady} onActorError={theater.markActorReady}
            onPlacementChange={c.patchPlacement}
            onTap={mode === 'mock' ? say : undefined}
            onActorScale={(s, scale) =>
              c.patchPlacement(s, {
                x: layout.leftPct / 100,
                y: layout.topPct / 100,
                scale,
              })
            }
          />
        ))}
      </div>

      <StageDialogBox
        speakerName={dialogSpeaker}
        text={dialogText}
        visible={c.payload.showDialog && !c.uiHidden && Boolean(activeLine)}
      />

      {mode === 'theater' && (
        <StageTheaterOverlay
          episode={episode}
          index={theater.index}
          total={theater.total} actTitle={theaterActAt(episode, theater.index)?.title}
          line={theater.current}
          uiHidden={c.uiHidden} shareOpen={shareOpen}
          ready={theater.ready} readyCount={theater.readyCount} readyTotal={theater.readyTotal}
          bgmMuted={theater.bgmMuted}
          audioBlocked={theater.audioBlocked}
          onToggleBgm={theater.toggleBgm}
          onSave={() => void c.requestScreenshot()}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* 控制栏（空闲淡出） */}
      <div
        className="pointer-events-none absolute inset-0 z-40 transition-opacity duration-300"
        style={{ opacity: showChrome ? 1 : 0 }}
        data-testid="stage-chrome"
        data-visible={showChrome}
      >
        <StageToolbar
          mode={mode}
          powerMode={c.powerMode}
          autoDegraded={c.autoDegraded}
          onPowerModeChange={c.setPowerMode}
          payload={c.payload}
          onPayloadChange={c.setPayload}
          onNextSpeaker={c.nextSpeaker}
          onSayLine={() => say()}
          onCycleExpression={c.cycleExpression}
          onDefocus={() => {
            stop();
            c.defocus();
          }}
          onScreenshot={() => void c.requestScreenshot()}
          onExit={exitStage}
          onSwitchMode={(next) => window.location.assign(next === 'theater' ? '/stage?stage=play' : '/stage')}
          theater={
            mode === 'theater'
              ? {
                  index: theater.index,
                  total: theater.total,
                  playing: theater.playing,
                  shareOpen,
                  onPrev: theater.prev,
                  onNext: theater.next,
                  onRestart: theater.restart,
                  onToggle: theater.toggle,
                  onShare: () => setShareOpen(true),
                }
              : undefined
          }
        />
      </div>

      {/* 快捷键提示（与控制栏同隐显；截图不含） */}
      <div
        className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/70 transition-opacity duration-300"
        style={{ opacity: showChrome ? 1 : 0 }}
      >
        {t('stage.ui.hideHint')}
      </div>
    </div>
  );
}
