'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { StageSlot } from '@wbfm/shared/schemas';
import { StageBackgroundLayer } from './stage-background';
import { StageActor } from './stage-actor';
import { StageDialogBox } from './stage-dialog-box';
import { StageToolbar } from './stage-toolbar';
import { computeActorLayout, SLOT_ORDER } from './stage-layout';
import { MOCK_CAST, findMockMember } from './mock-cast';
import { useStageController } from './use-stage-controller';
import { getStageBridge } from './stage-bridge';

/**
 * 舞台根（M1 mock cast 可演）：
 * 背景层 → 暖光层 → 三槽角色 → 对话框 → 控制栏。
 * 快捷键：H 隐 UI / F11 全屏 / Esc 逐级退出 / Ctrl+滚轮画面缩放。
 */
export function StageRoot() {
  const { t } = useI18n();
  const router = useRouter();
  const c = useStageController();
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

  const focusedMember = c.focus ? findMockMember(c.focus) : null;
  const showChrome = !c.uiHidden && c.controlsVisible;

  return (
    <div
      ref={rootRef}
      className="relative h-screen w-screen overflow-hidden bg-black"
      data-testid="stage-root"
      data-power={c.powerMode}
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

      {/* 三槽角色 */}
      <div className="absolute inset-0 z-10" data-testid="stage-cast">
        {SLOT_ORDER.map((slot: StageSlot) => {
          const member = MOCK_CAST.find((m) => m.slot === slot) ?? MOCK_CAST[1]!;
          const live = c.powerMode === 'live' || slot === c.focus;
          return (
            <StageActor
              key={slot}
              slot={slot}
              member={{ ...member, expression: c.expressions[slot]! }}
              layout={computeActorLayout(slot, c.payload, c.focus)}
              live={live}
              expression={c.expressions[slot]!}
              actionLabelKey={member.actionLabelKey}
              speaking={slot === c.speakingSlot && Boolean(c.speech[slot])}
              showNameplate={c.payload.showNameplates}
              getLevel={c.levelReader(slot)}
              onPlacementChange={c.patchPlacement}
              onActorScale={(s, scale) =>
                c.patchPlacement(s, {
                  x: computeActorLayout(s, c.payload, c.focus).leftPct / 100,
                  y: computeActorLayout(s, c.payload, c.focus).topPct / 100,
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
        speakerName={focusedMember?.displayName ?? ''}
        text={c.focus ? c.speech[c.focus] : null}
        visible={c.payload.showDialog && !c.uiHidden}
      />

      {/* 控制栏（空闲淡出） */}
      <div
        className="pointer-events-none absolute inset-0 z-40 transition-opacity duration-300"
        style={{ opacity: showChrome ? 1 : 0 }}
        data-testid="stage-chrome"
        data-visible={showChrome}
      >
        <StageToolbar
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
