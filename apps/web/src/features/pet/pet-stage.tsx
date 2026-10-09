'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import { Live2dCanvas } from '@/features/avatar/live2d-canvas';
import type { ExpressionTag } from '@/features/avatar/expression-parser';
import type { PetVoiceState } from '@wbfm/shared/pet';
import { getPetBridge } from './pet-bridge';
import { PetSubtitle } from './pet-subtitle';

interface Props {
  modelId: string;
  expression: ExpressionTag;
  voiceState: PetVoiceState;
  subtitle: string;
  getLevel: () => number;
}

// Electron 扩展 CSS 属性（React 类型未声明）
const REGION_DRAG = { WebkitAppRegion: 'drag' } as unknown as CSSProperties;
const REGION_NO_DRAG = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties;

/**
 * 桌宠舞台（透明窗满铺）。交互分区（互斥，全部交给系统手势层，无手动移窗）：
 *
 * - 身体盒 `-webkit-app-region: drag`：系统原生拖拽窗口。关键收益——drag 区
 *   **忽略一切指针事件**，因此按下/微移/松手都不会冒泡到 Live2D canvas，
 *   从根上杜绝误触 tap 动作（带凑近放大）造成的「一拖就变大」；也没有
 *   setPosition 高频移窗带来的坐标错位/闪烁。
 * - 头部盒 `no-drag`：单击播 Live2D tap 挥手、右键弹菜单（DOM contextmenu 可达）。
 * - 身体 drag 区的右键被系统拖拽层吞掉，由主进程钩 WM_RBUTTONUP 弹菜单兜底
 *   （见 pet-manager），所以整个舞台仍保留 onContextMenu 处理头部路径。
 * - 双击：头部 no-drag 区可收到 → 回主窗。
 */
export function PetStage({ modelId, expression, voiceState, subtitle, getLevel }: Props) {
  const bridge = React.useMemo(() => getPetBridge(), []);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    bridge?.showMenu();
  };

  return (
    <div
      data-testid="pet-stage"
      data-state={voiceState}
      className="relative h-screen w-screen overflow-hidden bg-transparent"
    >
      <div className="absolute inset-0">
        <Live2dCanvas
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={voiceState === 'speaking'}
        />
      </div>

      {/* 身体拖拽盒：系统 drag，吞掉全部点击/右键（右键由主进程 WM_RBUTTONUP 兜底） */}
      <div
        data-testid="pet-hitbody"
        style={REGION_DRAG}
        className="absolute bottom-0 left-1/2 z-10 h-[72%] w-[72%] -translate-x-1/2 cursor-grab"
        title="拖动移动位置，右键打开菜单"
      />

      {/* 头部互动盒：no-drag，单击挥手 / 双击回主窗 / 右键菜单；命中列上部约 28% */}
      <div
        data-testid="pet-hithead"
        style={REGION_NO_DRAG}
        className="absolute left-1/2 top-[11%] z-20 h-[25%] w-[60%] -translate-x-1/2"
        onContextMenu={handleContextMenu}
        onDoubleClick={() => bridge?.focusMain()}
        title="双击回到主窗口，右键打开菜单"
      />

      <PetSubtitle text={subtitle} voiceState={voiceState} />
    </div>
  );
}
