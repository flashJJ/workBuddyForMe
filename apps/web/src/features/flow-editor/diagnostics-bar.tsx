'use client';

import { AlertTriangle, Crosshair, XCircle } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { FlowDiagnostic } from '@wbfm/shared/types';
import type { FlowCanvasNode } from './graph-utils';

interface DiagnosticsBarProps {
  diagnostics: FlowDiagnostic[];
  nodes: FlowCanvasNode[];
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

/** 画布底部悬浮诊断条：点击条目定位并选中问题节点 */
export function DiagnosticsBar({ diagnostics, nodes, onSelectNode, onClose }: DiagnosticsBarProps) {
  const { t } = useI18n();
  const { setCenter } = useReactFlow();
  if (diagnostics.length === 0) return null;

  const locate = (d: FlowDiagnostic) => {
    if (!d.nodeId) return;
    const node = nodes.find((n) => n.id === d.nodeId);
    onSelectNode(d.nodeId);
    if (node) {
      void setCenter(node.position.x + 104, node.position.y + 40, { zoom: 1.1, duration: 400 });
    }
  };

  return (
    <div className="absolute bottom-3 left-3 z-10 max-h-44 w-96 overflow-y-auto rounded-lg border bg-card/95 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-xs font-medium">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        {t('flowEditor.diagnostics.title', { count: diagnostics.length })}
        <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t('flowEditor.diagnostics.close')}
        </button>
      </div>
      <ul className="divide-y">
        {diagnostics.map((d, i) => (
          <li key={`${d.code}-${i}`}>
            <button
              type="button"
              disabled={!d.nodeId}
              onClick={() => locate(d)}
              className={cn(
                'flex w-full items-start gap-2 px-3 py-2 text-left text-[11px]',
                d.nodeId && 'hover:bg-accent/60',
                !d.nodeId && 'cursor-default',
              )}
            >
              {d.severity === 'error' ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              )}
              <span className="flex-1 leading-snug">{d.message}</span>
              {d.nodeId && <Crosshair className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
