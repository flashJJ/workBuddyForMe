'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getAvatarModel } from './avatar-models';
import { loadCubismCore } from './live2d-core';
import type { Live2dController } from './live2d-controller';
import type { ExpressionTag } from './expression-parser';

interface StageProps {
  modelId: string;
  expression: ExpressionTag;
  getLevel: () => number;
  speaking: boolean;
}

/** 形象舞台：挂 Core→建 PIXI 应用→加载模型；rAF 喂口型；点击播放 Tap 动作 */
export function Live2dStage({ modelId, expression, getLevel, speaking }: StageProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const controllerRef = React.useRef<Live2dController | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let raf = 0;

    const boot = async () => {
      const spec = getAvatarModel(modelId);
      await loadCubismCore();
      if (cancelled) return;
      const { Live2dController } = await import(
        /* webpackChunkName: "live2d-renderer" */ './live2d-controller'
      );
      if (cancelled) return;
      const controller = await Live2dController.create(host, {
        model: spec,
        onError: (message) => !cancelled && setError(message),
      });
      if (cancelled) {
        controller.dispose();
        return;
      }
      controllerRef.current = controller;
      const pump = () => {
        controller.setLipLevel(getLevel());
        raf = requestAnimationFrame(pump);
      };
      raf = requestAnimationFrame(pump);
    };
    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // 模型切换时整体重建；getLevel 由调用方保证稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  React.useEffect(() => {
    void controllerRef.current?.setExpression(expression);
  }, [expression]);

  return (
    <div className="relative h-full w-full" data-testid="live2d-stage">
      <div
        ref={hostRef}
        role="img"
        aria-label="Live2D 虚拟形象（点击互动）"
        className="h-full w-full cursor-pointer"
        data-speaking={speaking}
        onClick={() => controllerRef.current?.tap()}
      />
      {error && (
        <div
          className="absolute inset-x-2 bottom-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-background/90 p-2 text-xs text-amber-600 dark:text-amber-400"
          data-testid="live2d-error"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
