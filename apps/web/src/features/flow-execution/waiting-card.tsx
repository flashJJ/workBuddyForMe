'use client';

import { ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { FlowCanvasNode } from '../flow-editor/graph-utils';
import { str } from '../flow-editor/config/form-primitives';

interface WaitingCardProps {
  node: FlowCanvasNode;
  busy: boolean;
  onSubmitHuman: (approved: boolean) => void;
  onToolConfirm: (allowed: boolean) => void;
}

/** 挂起节点内联操作：human=通过/驳回；tool(write/danger)=允许/拒绝执行 */
export function WaitingCard({ node, busy, onSubmitHuman, onToolConfirm }: WaitingCardProps) {
  const { t } = useI18n();
  if (node.type === 'human') {
    return (
      <div className="mx-4 mb-3 rounded-md border border-warning/30 bg-warning-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
          <UserCheck className="h-4 w-4" />
          {t('flowExecution.humanWaiting.title')}
        </div>
        {str(node.data.config.prompt) && (
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
            {str(node.data.config.prompt)}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onSubmitHuman(false)}
          >
            {t('flowExecution.humanWaiting.reject')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onSubmitHuman(true)}>
            {t('flowExecution.humanWaiting.approve')}
          </Button>
        </div>
      </div>
    );
  }

  if (node.type === 'tool') {
    return (
      <div className="mx-4 mb-3 rounded-md border border-warning/30 bg-warning-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
          <ShieldAlert className="h-4 w-4" />
          {t('flowExecution.toolWaiting.title')}
        </div>
        <p className="mt-1.5 break-all font-mono text-xs">{str(node.data.config.toolName)}</p>
        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-1.5 font-mono text-[10px]">
          {JSON.stringify(node.data.config.args ?? {}, null, 2)}
        </pre>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onToolConfirm(false)}>
            {t('flowExecution.toolWaiting.deny')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onToolConfirm(true)}>
            {t('flowExecution.toolWaiting.allow')}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
