'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/use-i18n';
import { translateSystemText } from '@/lib/i18n/system-text-runtime';
import type { StageCastMember, StageSlot } from '@wbfm/shared/schemas';
import { StageBackgroundLayer } from './stage-background';
import { StageActor } from './stage-actor';
import { StageDialogBox } from './stage-dialog-box';
import { StageToolbar } from './stage-toolbar';
import { computeActorLayout, meetingPosition } from './stage-layout';
import { useStageController, type StageMode } from './use-stage-controller';
import { useStageRun } from './use-stage-run';
import { useMeetingStage } from './use-meeting-stage';
import { getStageBridge } from './stage-bridge';

/** 从 query 取目标 id（effect 内读 window，首帧恒等于 SSR 避免水合错配） */
function useStageTarget(): { runId: string | null; meetingId: string | null } {
  const [target, setTarget] = React.useState<{ runId: string | null; meetingId: string | null }>({
    runId: null,
    meetingId: null,
  });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clean = (v: string | null) => (v && /^[a-zA-Z0-9_-]{1,80}$/.test(v) ? v : null);
    setTarget({ runId: clean(params.get('run')), meetingId: clean(params.get('meeting')) });
  }, []);
  return target;
}

/**
 * 舞台根：
 * - mock 模式（M1）：本地演示 cast 可演；
 * - run 模式（M2，?run=id）：只读订阅真实协作 run；
 * - meeting 模式（M3，?meeting=id）：只读观看多助手会议（2–4 席）。
 * 后两者零执行控件，关窗不杀后台；快捷键 H/F11/Esc/Ctrl+滚轮。
 */
export function StageRoot() {
  const { t } = useI18n();
  const router = useRouter();
  const { runId, meetingId } = useStageTarget();
  const mode: StageMode = meetingId ? 'meeting' : runId ? 'run' : 'mock';
  const c = useStageController(mode);
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
        void toggleFullscreen();
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
        {c.cast.map((member, castIndex) => {
          const slot = member.slot;
          const live = c.powerMode === 'live' || slot === c.focus;
          const positionOverride =
            mode === 'meeting'
              ? meetingPosition(castIndex, Math.max(c.cast.length, 2))
              : null;
          return (
            <StageActor
              key={slot}
              slot={slot}
              member={{ ...member, expression: c.expressions[slot]! }}
              layout={computeActorLayout(slot, c.payload, c.focus, positionOverride)}
              live={live}
              expression={c.expressions[slot]!}
              actionLabelKey={
                mode === 'mock' ? member.actionLabelKey : `stage.run.action.${c.motions[slot]}`
              }
              speaking={slot === c.speakingSlot && Boolean(c.speech[slot])}
              showNameplate={c.payload.showNameplates}
              getLevel={c.levelReader(slot)}
              onPlacementChange={c.patchPlacement}
              onActorScale={(s, scale) =>
                c.patchPlacement(s, {
                  x: computeActorLayout(s, c.payload, c.focus, positionOverride).leftPct / 100,
                  y: computeActorLayout(s, c.payload, c.focus, positionOverride).topPct / 100,
                  scale,
                })
              }
              snapshot={c.snapshots[member.avatarModelId] ?? null}
              onSnapshot={c.setSnapshot}
            />
          );
        })}
      </div>

      <StageDialogBox
        speakerName={dialogSpeaker}
        text={dialogText}
        visible={c.payload.showDialog && !c.uiHidden && Boolean(activeLine)}
      />

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
          onPowerModeChange={c.setPowerMode}
          payload={c.payload}
          onPayloadChange={c.setPayload}
          onNextSpeaker={c.nextSpeaker}
          onSayLine={c.sayLine}
          onCycleExpression={c.cycleExpression}
          onDefocus={c.defocus}
          onScreenshot={() => void c.requestScreenshot()}
          onExit={exitStage}
        />
      </div>

      {/* 快捷键提示（与控制栏同隐显；截图不含） */}
      <div
        className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/70 transition-opacity duration-300"
        style={{ opacity: showChrome ? 1 : 0 }}
      >
        {t('stage.ui.hideHint')}
      </div>
    </div>
  );
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* 窗口宿主可能不允许全屏（Electron 用 F11 原生切换，这里静默） */
  }
}
