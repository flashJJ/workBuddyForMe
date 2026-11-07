'use client';

import * as React from 'react';
import type { StageSlot } from '@wbfm/shared/schemas';
import type { StageLive2dController } from './controller';
import type { StageLive2dActor } from './types';

interface Props {
  actors: StageLive2dActor[];
  powerMode: 'live' | 'portrait';
  focus: StageSlot | null;
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

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-0"
      data-testid="stage-live2d-layer"
    />
  );
}
