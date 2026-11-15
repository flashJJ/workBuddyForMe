'use client';

import * as React from 'react';
import { parseVrmAvatarId, DEFAULT_MOTION_MOOD, type MotionMood } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ExpressionTag } from '../expression/expression-parser';
import type { FrameMode } from '../performance/frame-governor';
import type { AvatarScreenRect } from '../performance/screen-rect';
import { createVrmSession, type VrmSession } from './session/vrm-session';
import { VrmController, type VrmControllerLike } from './vrm-controller';

export type { VrmControllerLike };
export type { VRM } from '@pixiv/three-vrm';

export interface VrmCanvasProps {
  modelId: string;
  speaking?: boolean;
  getLevel?: () => number;
  expression?: ExpressionTag | null;
  /** 表情强度（1 轻 / 2 中 / 3 强）；缺省 2 */
  expressionIntensity?: 1 | 2 | 3;
  /** Live2D 已有：传入 TouchControllerLike 实例，PetStage 的 useHeadTouch 会调用它 */
  controllerRef?: React.MutableRefObject<VrmControllerLike | null>;
  /** 舞台相对位置朝向：左右角色向内微转（弧度；Live2D 忽略） */
  stageFacing?: number;
  /** 是否需要接收鼠标事件（默认 false → 穿透不挡点击；桌宠交互场景显式传 true） */
  interactive?: boolean;
  /** v2.2：情绪档位 / 关系等级（待机动作按档位挑选；缺省 normal / 0） */
  mood?: MotionMood;
  relationshipLevel?: number;
  /** v3.0 P0：帧率档位（桌宠交互 60 / 待机 30 / 隐藏 0） */
  frameMode?: FrameMode;
  /** v3.0 P1：睡眠（闭眼/低头/动作减速） */
  sleeping?: boolean;
  faceAway?: boolean;
  /** v3.5：桌宠大小（只影响取景比例；主窗形象栏忽略） */
  petSize?: 'sm' | 'md' | 'lg';
  /** v3.0 P4：Q 版比例（仅 VRM；切换后自动重新取景） */
  chibi?: boolean;
  /** v3.0 M4：stage 只用内置待机，避免导入动作在展示面轮播 */
  motionProfile?: 'default' | 'stage';
  /** v3.0 P0：模型屏幕包围盒（桌宠命中轮廓） */
  onModelRect?: (rect: AvatarScreenRect | null) => void;
  onFrame?: (dtMs: number) => void;
  /** 模型就绪（舞台加载幕布用） */
  onReady?: () => void;
  /** 模型加载失败（舞台允许降级放行） */
  onError?: (message: string) => void;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

/**
 * VRM 画布（v3.0 P4：薄包装）。
 *
 * 渲染运行时全部交给 VrmSession：renderer/scene/相机/rAF 只建一次，
 * modelId 变化只触发 `loadModel` 热替换，不销毁 canvas，因此换模型不闪黑帧。
 */
export function VrmCanvas({
  modelId,
  speaking = false,
  getLevel,
  expression = null,
  expressionIntensity = 2,
  stageFacing = 0,
  controllerRef,
  interactive = false,
  mood = DEFAULT_MOTION_MOOD,
  relationshipLevel = 0,
  frameMode = 'idle',
  sleeping = false,
  faceAway = false,
  petSize,
  chibi = false,
  motionProfile = 'default',
  onModelRect,
  onFrame,
  onReady,
  onError,
  className,
  style,
  'data-testid': testId,
}: VrmCanvasProps) {
  const { t } = useI18n();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const sessionRef = React.useRef<VrmSession | null>(null);
  const petSizeRef = React.useRef<'sm' | 'md' | 'lg'>(petSize ?? 'md');
  const petModeRef = React.useRef(petSize !== undefined);
  const chibiRef = React.useRef(chibi);
  const builtinIdleRef = React.useRef(motionProfile === 'stage');
  const controllerRefInternal = React.useRef<VrmController | null>(null);
  const externalControllerRef = React.useRef(controllerRef);
  const speakingRef = React.useRef(speaking);
  const getLevelRef = React.useRef(getLevel);
  const expressionRef = React.useRef(expression);
  const expressionIntensityRef = React.useRef(expressionIntensity);
  const stageFacingRef = React.useRef(stageFacing);
  const moodRef = React.useRef(mood);
  const relationshipLevelRef = React.useRef(relationshipLevel);
  const frameModeRef = React.useRef(frameMode);
  const sleepingRef = React.useRef(sleeping);
  const faceAwayRef = React.useRef(faceAway);
  const onModelRectRef = React.useRef(onModelRect);
  const onFrameRef = React.useRef(onFrame);
  const onReadyRef = React.useRef(onReady);
  const onErrorRef = React.useRef(onError);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  React.useEffect(() => { getLevelRef.current = getLevel; }, [getLevel]);
  // 表情按 prop 变化下发：不能每帧写回基线，否则事件演出会被立刻覆盖
  React.useEffect(() => {
    expressionRef.current = expression;
    expressionIntensityRef.current = expressionIntensity;
    if (expression) {
      controllerRefInternal.current?.setExpression(expression, expressionIntensity);
    }
  }, [expression, expressionIntensity]);
  React.useEffect(() => {
    stageFacingRef.current = stageFacing;
    controllerRefInternal.current?.setStageFacing(stageFacing);
  }, [stageFacing]);
  React.useEffect(() => { moodRef.current = mood; }, [mood]);
  React.useEffect(() => { relationshipLevelRef.current = relationshipLevel; }, [relationshipLevel]);
  React.useEffect(() => { frameModeRef.current = frameMode; }, [frameMode]);
  React.useEffect(() => { sleepingRef.current = sleeping; }, [sleeping]);
  React.useEffect(() => { onModelRectRef.current = onModelRect; }, [onModelRect]);
  React.useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  React.useEffect(() => { onErrorRef.current = onError; }, [onError]);
  // 桌宠大小切换：比例变化不改变容器尺寸，需要主动重 fit 一次
  React.useEffect(() => {
    petSizeRef.current = petSize ?? 'md';
    petModeRef.current = petSize !== undefined;
    sessionRef.current?.refit();
  }, [petSize]);
  // Q 版：改写骨架缩放后重取景；脚底贴地由 session 的 onFit 统一修正
  React.useEffect(() => {
    chibiRef.current = chibi;
    controllerRefInternal.current?.setChibi(chibi);
    sessionRef.current?.refit();
  }, [chibi]);
  onFrameRef.current = onFrame;

  React.useEffect(() => {
    builtinIdleRef.current = motionProfile === 'stage';
  }, [motionProfile]);

  React.useEffect(() => {
    controllerRefInternal.current?.setSleeping(sleeping);
  }, [sleeping]);

  React.useEffect(() => {
    faceAwayRef.current = faceAway;
    controllerRefInternal.current?.setFaceAway(faceAway);
  }, [faceAway]);

  const fileRef = parseVrmAvatarId(modelId);

  // 运行时只建一次：换模型走下面的 loadModel，不重建 renderer/canvas
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const session = createVrmSession({
      host,
      getPetSize: () => petSizeRef.current,
      isPet: () => petModeRef.current,
      getRuntime: () => ({
        speaking: speakingRef.current,
        level: () => getLevelRef.current?.() ?? 0,
        mood: moodRef.current,
        relationshipLevel: relationshipLevelRef.current,
        frameMode: frameModeRef.current,
        sleeping: sleepingRef.current,
        faceAway: faceAwayRef.current,
        expression: expressionRef.current,
        expressionIntensity: expressionIntensityRef.current,
        stageFacing: stageFacingRef.current,
        chibi: chibiRef.current,
        builtinIdleOnly: builtinIdleRef.current,
      }),
      onController: (controller) => {
        controllerRefInternal.current = controller;
        const external = externalControllerRef.current;
        if (external) external.current = controller;
      },
      onReady: (value) => {
        setReady(value);
        if (value) onReadyRef.current?.();
      },
      onError: (message) => {
        setError(message);
        if (message) onErrorRef.current?.(message);
      },
      onModelRect: (rect) => onModelRectRef.current?.(rect),
      onFrame: (dtMs) => onFrameRef.current?.(dtMs),
    });
    sessionRef.current = session;
    // 尺寸同步（renderer/canvas/camera.aspect）+ 首帧取景；只 refit 会让 canvas 停在默认 300×150
    const observer = new ResizeObserver(() => session.resize());
    observer.observe(host);
    session.resize();
    return () => {
      observer.disconnect();
      sessionRef.current = null;
      session.dispose();
    };
  }, []);

  // 模型切换（含首次）：同一 session 内热替换
  React.useEffect(() => {
    if (!fileRef) return;
    void sessionRef.current?.loadModel(fileRef);
  }, [fileRef]);

  const pointerClass = interactive ? '' : 'pointer-events-none';
  return (
    <div className={`relative h-full w-full ${pointerClass}`}>
      <div
        ref={hostRef}
        className={className ? `h-full w-full ${className}` : 'h-full w-full'}
        style={style}
        data-testid={testId}
      />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 text-xs text-muted-foreground">
          {t('avatar.stage.loading')}
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
