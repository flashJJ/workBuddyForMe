'use client';

import * as React from 'react';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { NODE_META, PALETTE_TYPES } from './node-meta';

export const FLOW_DND_MIME = 'application/x-wbfm-flow-node';

/** 左侧节点面板：拖拽或点击添加节点 */
export function NodePalette({ onAdd }: { onAdd: (type: FlowNodeType) => void }) {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, type: FlowNodeType) => {
    event.dataTransfer.setData(FLOW_DND_MIME, type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-card/40 p-3">
      <p className="px-1 text-xs font-medium text-muted-foreground">节点</p>
      {PALETTE_TYPES.map((type) => {
        const meta = NODE_META[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            onClick={() => onAdd(type)}
            title="拖拽到画布，或点击添加"
            className={cn(
              'group cursor-grab rounded-md border bg-background p-2.5 transition-colors',
              'hover:border-primary/60 hover:bg-accent/50 active:cursor-grabbing',
            )}
          >
            <div className="flex items-center gap-2">
              <meta.icon className={cn('h-4 w-4', meta.accent)} />
              <span className="text-sm font-medium">{meta.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
              {meta.description}
            </p>
          </div>
        );
      })}
      <p className="mt-auto px-1 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        提示：从节点右侧圆点拖出连线；条件节点分出「是/否」两条分支。
      </p>
    </aside>
  );
}
