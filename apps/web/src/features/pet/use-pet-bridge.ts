'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { PetPerformanceEvent, PetVoiceState } from '@wbfm/shared/pet';
import { DEFAULT_EXPRESSION, type ExpressionTag } from '@/features/avatar/expression-parser';
import { getPetBridge, isPetHitPoint } from './pet-bridge';

export interface PetRuntime {
  /** 桌面桥是否可用（false 时页面会重定向，仅首帧可能为 false） */
  ready: boolean;
  voiceState: PetVoiceState;
  subtitle: string;
  expression: ExpressionTag;
  /** Live2D 口型电平读取器（rAF 轮询，不走渲染） */
  getLevel: () => number;
}

/**
 * /pet 窗运行时：订阅主进程转发的表现事件 + 全局 mousemove 命中上报。
 *
 * 悬停用 window mousemove + 坐标命中盒（穿透 forward 态下 pointerenter 不可靠），
 * rAF 合并一帧最多上报一次；离开窗口边界视为离开命中区。
 */
export function usePetBridge(): PetRuntime {
  const router = useRouter();
  const bridge = React.useMemo(() => getPetBridge(), []);

  const [voiceState, setVoiceState] = React.useState<PetVoiceState>('idle');
  const [subtitle, setSubtitle] = React.useState('');
  const [expression, setExpression] = React.useState<ExpressionTag>(DEFAULT_EXPRESSION);
  const levelRef = React.useRef(0);

  React.useEffect(() => {
    if (!bridge) {
      // 裸浏览器访问 /pet（无 preload 桥）：重定向回主对话页，不初始化形象
      router.replace('/chat');
      return;
    }
    const off = bridge.onPerformance((event: PetPerformanceEvent) => {
      switch (event.kind) {
        case 'level':
          levelRef.current = event.value;
          break;
        case 'state':
          setVoiceState(event.state);
          if (event.state === 'idle') levelRef.current = 0;
          break;
        case 'subtitle':
          setSubtitle(event.text);
          break;
        case 'expression':
          setExpression(event.tag as ExpressionTag);
          break;
        case 'conversation':
          setSubtitle('');
          setExpression(DEFAULT_EXPRESSION);
          setVoiceState('idle');
          levelRef.current = 0;
          break;
      }
    });
    return off;
  }, [bridge, router]);

  React.useEffect(() => {
    if (!bridge) return;
    let lastHover: boolean | null = null;
    let scheduled = false;
    const report = (hovering: boolean) => {
      if (hovering === lastHover) return;
      lastHover = hovering;
      bridge.reportHover(hovering);
    };
    const onMove = (event: MouseEvent) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        report(
          isPetHitPoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight),
        );
      });
    };
    const onLeave = () => report(false);
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [bridge]);

  const getLevel = React.useCallback(() => levelRef.current, []);

  return { ready: Boolean(bridge), voiceState, subtitle, expression, getLevel };
}
