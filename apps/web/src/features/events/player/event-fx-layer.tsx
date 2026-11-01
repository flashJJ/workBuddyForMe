'use client';

import * as React from 'react';
import type { EventFxId } from '@wbfm/shared/schemas';
import { EVENT_FX_DURATION_MS, type ActiveFx } from './fx-registry';

/**
 * v1.7 事件 fx 呈现层：绝对覆盖在形象舞台上，纯 DOM/CSS（零三方粒子库）。
 * pointer-events-none：不拦截舞台点击/摸头；动画时长与 fx-registry 注册口径一致，
 * 摘除由 EventPlayer 定时驱动，本组件只负责呈现，CSS 动画 forwards 自然收尾。
 */

const FX_SHAPE: Record<EventFxId, React.ReactNode> = {
  // 三颗爱心右上浮动
  hearts: (
    <>
      <span className="event-fx-glyph event-fx-heart" style={{ left: '62%', top: '26%' }}>
        ♥
      </span>
      <span
        className="event-fx-glyph event-fx-heart event-fx-heart-2"
        style={{ left: '72%', top: '34%' }}
      >
        ♥
      </span>
      <span
        className="event-fx-glyph event-fx-heart event-fx-heart-3"
        style={{ left: '56%', top: '40%' }}
      >
        ♥
      </span>
    </>
  ),
  // 汗滴：右上短暂悬停下滑
  sweat: (
    <span className="event-fx-glyph event-fx-sweat" style={{ right: '20%', top: '22%' }}>
      💧
    </span>
  ),
  // 星闪：头部两侧两点交替
  sparkle: (
    <>
      <span className="event-fx-glyph event-fx-spark" style={{ left: '30%', top: '18%' }}>
        ✦
      </span>
      <span
        className="event-fx-glyph event-fx-spark event-fx-spark-2"
        style={{ right: '28%', top: '26%' }}
      >
        ✦
      </span>
    </>
  ),
  // 整层淡入：舞台区域一次性柔光扫过
  fadeIn: <span className="event-fx-fadein" aria-hidden="true" />,
};

export interface EventFxLayerProps {
  fx: ActiveFx[];
}

export function EventFxLayer({ fx }: EventFxLayerProps) {
  if (fx.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="event-fx-layer"
      aria-hidden="true"
    >
      {fx.map((item) => (
        <span
          key={item.key}
          className="event-fx-instance"
          data-testid={`event-fx-${item.id}`}
          data-fx={item.id}
          style={{
            animationDuration: `${EVENT_FX_DURATION_MS[item.id]}ms`,
          }}
        >
          {FX_SHAPE[item.id]}
        </span>
      ))}
    </div>
  );
}
