'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import type {
  StageCastMember,
  StageDirection,
  StageMotionGroup,
  StageScenePayload,
  StageSlot,
  StageSlotPlacement,
} from '@wbfm/shared/schemas';
import type { ExpressionTag } from '@/features/avatar/expression-parser';
import { FrameWatchdog } from './frame-watchdog';
import { clampSceneZoom } from './stage-layout';
import { MOCK_CAST, MOCK_EXPRESSIONS, MOCK_SPEECH } from './mock-cast';
import { defaultScenePayload } from './stage-defaults';
import { applyStageDirection } from './apply-stage-direction';
import { useStageScreenshot } from './use-stage-screenshot';
import type { StagePowerMode } from './stage-toolbar';

const FOCUS_CYCLE: StageSlot[] = ['left', 'center', 'right'];
const CONTROLS_FADE_MS = 2600;

/** mock=本地演示（M1）；run=真实协作 run 只读驱动（M2） */
export type StageMode = 'mock' | 'run';
export type StageRunStatus = 'connecting' | 'running' | 'done' | 'failed';

export interface StageController {
  mode: StageMode;
  payload: StageScenePayload;
  setPayload: (p: StageScenePayload) => void;
  cast: StageCastMember[];
  focus: StageSlot | null;
  expressions: Record<StageSlot, ExpressionTag>;
  motions: Record<StageSlot, StageMotionGroup>;
  speech: Record<StageSlot, string | null>;
  /** run 模式最近一句台词（散焦后对话框仍挂住，直到下一句） */
  lastLine: { slot: StageSlot; text: string } | null;
  runStatus: StageRunStatus | null;
  setRunStatus: (s: StageRunStatus) => void;
  applyDirection: (d: StageDirection) => void;
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

export function useStageController(mode: StageMode = 'mock'): StageController & {
  requestScreenshot: () => Promise<'saved' | 'canceled' | 'unsupported'>;
  handleEsc: () => 'defocused' | 'shown' | 'exited';
} {
  const { t } = useI18n();
  const toast = useToast();
  const [payload, setPayloadState] = React.useState<StageScenePayload>(() => defaultScenePayload());
  const [focus, setFocus] = React.useState<StageSlot | null>('center');
  const [cast, setCast] = React.useState<StageCastMember[]>(MOCK_CAST);
  const [expressions, setExpressions] = React.useState<Record<StageSlot, ExpressionTag>>({
    left: 'neutral',
    center: 'neutral',
    right: 'neutral',
  });
  const [motions, setMotions] = React.useState<Record<StageSlot, StageMotionGroup>>({
    left: 'idle',
    center: 'idle',
    right: 'idle',
  });
  const [speech, setSpeech] = React.useState<Record<StageSlot, string | null>>({
    left: null,
    center: null,
    right: null,
  });
  const [lastLine, setLastLine] = React.useState<{ slot: StageSlot; text: string } | null>(null);
  const [runStatus, setRunStatus] = React.useState<StageRunStatus | null>(
    mode === 'run' ? 'connecting' : null,
  );
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

  /** v1.9 M2：消费 StageDirection（由 use-stage-run 经适配器喂入） */
  const applyDirection = React.useCallback(
    (d: StageDirection) => {
      applyStageDirection(
        {
          setCast,
          setFocus,
          setExpressions,
          setSpeech,
          setMotions,
          setLastLine,
        },
        d,
      );
    },
    [],
  );

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

  const requestScreenshot = useStageScreenshot(setUiHidden);

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
    mode,
    payload,
    setPayload,
    cast,
    focus,
    expressions,
    motions,
    speech,
    lastLine,
    runStatus,
    setRunStatus,
    applyDirection,
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
