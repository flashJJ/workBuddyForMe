'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ExpressionTag } from './expression-parser';
import type { Live2dController } from './live2d-controller';

export interface Live2dCanvasProps {
  /** 模型 id（avatar-models 注册表） */
  modelId: string;
  /** 当前表情（规范标签） */
  expression: ExpressionTag;
  /** 播放电平读取器（0~1 RMS），rAF 轮询，不走 React 渲染 */
  getLevel: () => number;
  /** 是否正在说话（仅用于无障碍/状态展示） */
  speaking: boolean;
  /** v1.6：头部摸头回调（传入后舞台上 40% 为摸头区，其余为身体 tap） */
  onHeadTouch?: () => void;
  /** v1.6：控制器实例回传（摸头弹性/闪现表情需要直接驱动模型） */
  controllerRef?: React.MutableRefObject<Live2dController | null>;
  /** 是否需要接收鼠标事件（默认 false → 穿透不挡点击；桌宠交互场景显式传 true） */
  interactive?: boolean;
}

/** 动态 chunk 加载占位（独立组件以便 useI18n） */
function StageLoading() {
  const { t } = useI18n();
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t('avatar.stage.loading')}
    </div>
  );
}

/**
 * 动态导入边界：next/dynamic ssr:false 把 PIXI/Cubism/pld 全部切到独立 chunk，
 * 只有形象区真正挂载时才拉取；next/dynamic 的加载器本身保持轻量。
 */
const Live2dStage = dynamic(() => import('./live2d-stage').then((m) => m.Live2dStage), {
  ssr: false,
  loading: () => <StageLoading />,
});

export function Live2dCanvas(props: Live2dCanvasProps) {
  return <Live2dStage {...props} />;
}
