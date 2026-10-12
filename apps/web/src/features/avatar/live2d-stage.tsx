'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { getAvatarModel } from './avatar-models';
import { loadCubismCore } from './live2d-core';
import type { Live2dController } from './live2d-controller';
import type { ExpressionTag } from './expression-parser';

interface StageProps {
  modelId: string;
  expression: ExpressionTag;
  getLevel: () => number;
  speaking: boolean;
  /** v1.6：头部摸头（区别于身体 tap）；不传时整个画布回落为身体 tap */
  onHeadTouch?: () => void;
  /** 舞台顶部多少比例算头部区（与 pet 命中盒口径接近；默认 0.4） */
  headZoneRatio?: number;
  /** v1.6：控制器实例回传（外部摸头 hook 直接驱动模型） */
  controllerRef?: React.MutableRefObject<Live2dController | null>;
}

export function Live2dStage({
  modelId,
  expression,
  getLevel,
  speaking,
  onHeadTouch,
  headZoneRatio = 0.4,
  controllerRef: externalControllerRef,
}: StageProps) {
  const { t } = useI18n();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const internalRef = React.useRef<Live2dController | null>(null);
  const controllerRef = externalControllerRef ?? internalRef;
  const [error, setError] = React.useState<string | null>(null);
  // 回调放 ref，避免非 React 事件读到旧闭包
  const headTouchRef = React.useRef(onHeadTouch);
  headTouchRef.current = onHeadTouch;
  const ratioRef = React.useRef(headZoneRatio);
  ratioRef.current = headZoneRatio;

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
        // 控制器只上报底层错误详情，界面文案在渲染处经 t() 组装
        onError: (message) => !cancelled && setError(t('avatar.stage.loadFailed', { message })),
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

  // v1.6：视线跟随——指针在舞台内移动时归一化喂给控制器
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      controllerRef.current?.setGaze(nx, ny);
    };
    host.addEventListener('pointermove', onMove);
    return () => host.removeEventListener('pointermove', onMove);
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (headTouchRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const inHeadZone =
        rect.height > 0 && (event.clientY - rect.top) / rect.height < ratioRef.current;
      if (inHeadZone) {
        headTouchRef.current();
        return;
      }
    }
    controller.tap();
  };

  return (
    <div className="relative h-full w-full" data-testid="live2d-stage">
      <div
        ref={hostRef}
        role="img"
        aria-label={t('avatar.stage.ariaLabel')}
        className="h-full w-full cursor-pointer"
        data-speaking={speaking}
        data-has-head-touch={Boolean(onHeadTouch)}
        onClick={handleClick}
      />
      {error && (
        <div
          className="absolute inset-x-2 bottom-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-background/90 p-2 text-xs text-warning"
          data-testid="live2d-error"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
