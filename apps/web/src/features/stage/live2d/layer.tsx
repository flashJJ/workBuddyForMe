'use client';

import * as React from 'react';
import type { StageSlot } from '@wbfm/shared/schemas';
import type { StageMotionCue } from '../theater/stage-motion-cue';
import type { StageLive2dController } from './controller';
import type { StageLive2dActor } from './types';

interface Props {
  actors: StageLive2dActor[];
  powerMode: 'live' | 'portrait';
  focus: StageSlot | null;
  /** 剧场动作 cue：仅当槽位是 Live2D 角色时执行 */
  motionCue?: StageMotionCue | null;
  motionSlot?: StageSlot | null;
  /** 台词序号：变化时才重放 */
  motionKey?: number;
}

/**
 * 舞台 Live2D 共享层。
 * 宿主 div 始终同步渲染（服务端/客户端一致），PIXI 与 Cubism 在挂载后动态加载，
 * 既避免 SSR 水合错配，也保证未出现 Live2D 角色时不下载渲染 chunk。
 */
export function StageLive2dLayer(props: Props) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const controllerRef = React.useRef<StageLive2dController | null>(null);
  const latest = React.useRef(props);
  latest.current = props;

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void import('./controller')
      .then(async ({ createStageLive2dController }) => {
        const controller = await createStageLive2dController(host);
        if (cancelled) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
        controller.update(latest.current.actors, {
          powerMode: latest.current.powerMode,
          focus: latest.current.focus,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    controllerRef.current?.update(props.actors, {
      powerMode: props.powerMode,
      focus: props.focus,
    });
  }, [props.actors, props.powerMode, props.focus]);

  // 剧场 cue：控制器/模型未就绪时按台词序号重试，避免首句丢失
  React.useEffect(() => {
    const cue = props.motionCue;
    const slot = props.motionSlot;
    if (!cue || !slot || props.motionKey === undefined) return;
    if (!props.actors.some((actor) => actor.slot === slot)) return;
    let cancelled = false;
    let attempts = 0;
    const play = (): boolean => {
      const controller = controllerRef.current;
      if (!controller) return false;
      controller.playCue(slot, cue);
      return true;
    };
    if (play()) return;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (cancelled || play() || attempts >= 30) window.clearInterval(timer);
    }, 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // cue 对象每次渲染重建，触发只看台词序号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.motionKey, props.motionSlot]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-0"
      data-testid="stage-live2d-layer"
      data-motion-cue={props.motionCue && props.motionSlot ? `${props.motionSlot}:${props.motionCue.id}` : undefined}
    />
  );
}
