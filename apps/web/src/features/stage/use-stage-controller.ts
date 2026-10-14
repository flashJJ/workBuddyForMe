'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import type { StageScenePayload, StageSlot, StageSlotPlacement } from '@wbfm/shared/schemas';
import type { ExpressionTag } from '@/features/avatar/expression-parser';
import { FrameWatchdog } from './frame-watchdog';
import { clampSceneZoom } from './stage-layout';
import { MOCK_CAST, MOCK_EXPRESSIONS, MOCK_SPEECH, findMockMember } from './mock-cast';
import { defaultScenePayload } from './stage-defaults';
import type { StagePowerMode } from './stage-toolbar';

const FOCUS_CYCLE: StageSlot[] = ['left', 'center', 'right'];
const CONTROLS_FADE_MS = 2600;

export interface StageController {
  payload: StageScenePayload;
  setPayload: (p: StageScenePayload) => void;
  focus: StageSlot | null;
  expressions: Record<StageSlot, ExpressionTag>;
  speech: Record<StageSlot, string | null>;
  speakingSlot: StageSlot | null;
  powerMode: StagePowerMode;
  uiHidden: boolean;
  controlsVisible: boolean;
  snapshots: Record<string, string>;
  setSnapshot: (modelId: string, dataUrl: string) => void;
  nextSpeaker: () => void;
  sayLine: () => void;
  cycleExpression: () => void;
  defocus: () => void;
  setPowerMode: (mode: StagePowerMode) => void;
  toggleUi: () => void;
  patchPlacement: (slot: StageSlot, placement: StageSlotPlacement) => void;
  zoomSceneBy: (delta: number) => void;
  levelReader: (slot: StageSlot) => () => number;
  loadPayload: (payload: StageScenePayload) => void;
  poke: () => void;
}

export function useStageController(): StageController & {
  requestScreenshot: () => Promise<'saved' | 'canceled' | 'unsupported'>;
  handleEsc: () => 'defocused' | 'shown' | 'exited';
} {
  const { t } = useI18n();
  const toast = useToast();
  const [payload, setPayloadState] = React.useState<StageScenePayload>(() => defaultScenePayload());
  const [focus, setFocus] = React.useState<StageSlot | null>('center');
  const [expressions, setExpressions] = React.useState<Record<StageSlot, ExpressionTag>>({
    left: 'neutral',
    center: 'neutral',
    right: 'neutral',
  });
  const [speech, setSpeech] = React.useState<Record<StageSlot, string | null>>({
    left: null,
    center: null,
    right: null,
  });
  const [powerMode, setPowerModeState] = React.useState<StagePowerMode>('live');
  const [uiHidden, setUiHidden] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [snapshots, setSnapshots] = React.useState<Record<string, string>>({});
  const [autoDegraded, setAutoDegraded] = React.useState(false);
  const fadeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusRef = React.useRef(focus);
  focusRef.current = focus;
  const payloadRef = React.useRef(payload);
  payloadRef.current = payload;

  const pokeControls = React.useCallback(() => {
    setControlsVisible(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_FADE_MS);
  }, []);

  React.useEffect(() => {
    pokeControls();
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [pokeControls]);

  // 帧率看门狗：仅全 Live2D 档运行，触发一次自动降级
  React.useEffect(() => {
    if (powerMode !== 'live' || autoDegraded) return;
    const watchdog = new FrameWatchdog();
    watchdog.start((avg) => {
      setPowerModeState('portrait');
      setAutoDegraded(true);
      toast.info?.(`${t('stage.power.degraded')}（${avg.toFixed(1)}ms）`);
    });
    return () => watchdog.stop();
  }, [powerMode, autoDegraded, t, toast]);

  const setPayload = React.useCallback((p: StageScenePayload) => setPayloadState(p), []);
  const loadPayload = React.useCallback((p: StageScenePayload) => setPayloadState(p), []);

  const nextSpeaker = React.useCallback(() => {
    const current = focusRef.current;
    const idx = current ? FOCUS_CYCLE.indexOf(current) : -1;
    const next = FOCUS_CYCLE[(idx + 1) % FOCUS_CYCLE.length]!;
    setFocus(next);
    setExpressions((prev) => ({ ...prev, [next]: 'joy' }));
  }, []);

  const sayLine = React.useCallback(() => {
    const slot = focusRef.current;
    if (!slot) return;
    setSpeech((prev) => ({ ...prev, [slot]: MOCK_SPEECH[slot] }));
  }, []);

  const cycleExpression = React.useCallback(() => {
    const slot = focusRef.current;
    if (!slot) return;
    setExpressions((prev) => {
      const cur = prev[slot]!;
      const idx = MOCK_EXPRESSIONS.indexOf(cur as (typeof MOCK_EXPRESSIONS)[number]);
      const nextTag = MOCK_EXPRESSIONS[(idx + 1) % MOCK_EXPRESSIONS.length]!;
      return { ...prev, [slot]: nextTag };
    });
  }, []);

  const defocus = React.useCallback(() => setFocus(null), []);

  const setPowerMode = React.useCallback((mode: StagePowerMode) => {
    setPowerModeState(mode);
    if (mode === 'live') setAutoDegraded(false);
  }, []);

  const toggleUi = React.useCallback(() => {
    setUiHidden((v) => !v);
    pokeControls();
  }, [pokeControls]);

  const patchPlacement = React.useCallback((slot: StageSlot, placement: StageSlotPlacement) => {
    setPayloadState((prev) => ({
      ...prev,
      slots: { ...prev.slots, [slot]: placement },
    }));
  }, []);

  const zoomSceneBy = React.useCallback((delta: number) => {
    setPayloadState((prev) => ({ ...prev, sceneZoom: clampSceneZoom(prev.sceneZoom + delta) }));
  }, []);

  const setSnapshot = React.useCallback((modelId: string, dataUrl: string) => {
    setSnapshots((prev) => (prev[modelId] === dataUrl ? prev : { ...prev, [modelId]: dataUrl }));
  }, []);

  const levelReader = React.useCallback(
    (slot: StageSlot) => () => {
      // 仅当前发言者给正弦口型，其余静默
      if (focusRef.current !== slot || !speech[slot]) return 0;
      return Math.max(0.02, 0.25 + 0.22 * Math.sin(performance.now() / 180));
    },
    [speech],
  );

  const requestScreenshot = React.useCallback(async () => {
    const { getStageBridge } = await import('./stage-bridge');
    const bridge = getStageBridge();
    if (!bridge) {
      toast.error(t('stage.ui.screenshotUnsupported'));
      return 'unsupported' as const;
    }
    setUiHidden(true);
    // 等一帧让 UI 隐藏渲染完成，主进程截到的才是无 UI 画面
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const result = await bridge.capture();
    setUiHidden(false);
    if (result.canceled) toast.info?.(t('stage.ui.screenshotCanceled'));
    else toast.success(t('stage.ui.screenshotSaved'));
    return result.canceled ? ('canceled' as const) : ('saved' as const);
  }, [t, toast]);

  const handleEsc = React.useCallback((): 'defocused' | 'shown' | 'exited' => {
    if (focusRef.current) {
      setFocus(null);
      return 'defocused';
    }
    if (uiHidden) {
      setUiHidden(false);
      pokeControls();
      return 'shown';
    }
    return 'exited';
  }, [uiHidden, pokeControls]);

  return {
    payload,
    setPayload,
    focus,
    expressions,
    speech,
    speakingSlot: focus,
    powerMode,
    uiHidden,
    controlsVisible,
    snapshots,
    setSnapshot,
    nextSpeaker,
    sayLine,
    cycleExpression,
    defocus,
    setPowerMode,
    toggleUi,
    patchPlacement,
    zoomSceneBy,
    levelReader,
    loadPayload,
    poke: pokeControls,
    requestScreenshot,
    handleEsc,
  };
}
